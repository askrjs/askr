/**
 * Static Site Generation API
 *
 * Main orchestrator for batch rendering, file I/O, and metadata generation
 */

import type {
  RouteConfig,
  RouteRenderReason,
  RouteRenderResult,
  SSGGenerateOptions,
  SSGMode,
  SSGOptions,
  SSGResult,
} from './types';
import type { RoutePolicy, RouteRegistry } from '../common/router';
import { _getBuiltInRoutePolicy } from '../router/policy';
import {
  expandRoutes,
  resolveSsgRouteData,
  resolveSsgData,
  validateRoutes,
} from './resolve-ssg-data';
import { batchRenderRoutes } from './batch-render';
import { writeStaticFiles } from './write-static-files';
import {
  generateSSGResult,
  resultToMetadata,
  writeMetadata,
} from './generate-metadata';
import {
  getExistingOutputFileSize,
  outputFileExists,
  readIncrementalManifest,
  type IncrementalManifest,
  type IncrementalManifestRouteEntry,
  writeIncrementalManifest,
  hashHtml,
  SSG_MANIFEST_SCHEMA_VERSION,
} from './incremental-manifest';
import {
  getOutputFilePath,
  interpolateRoutePath,
  resolveRouteDescriptor,
  type ResolvedRouteDescriptor,
} from './route-utils';
import { addPerfDuration, incrementPerfMetric } from '../runtime/perf-metrics';

type AnyRouteConfig = RouteConfig<string>;

type StrictRouteConfig<TRoute extends AnyRouteConfig> = Omit<
  TRoute,
  'params' | 'entries'
> & {
  params?: RouteConfig<TRoute['path']>['params'];
  entries?: RouteConfig<TRoute['path']>['entries'];
};

type StrictRouteConfigs<TRoutes extends readonly AnyRouteConfig[]> = {
  [TIndex in keyof TRoutes]: TRoutes[TIndex] extends AnyRouteConfig
    ? StrictRouteConfig<TRoutes[TIndex]>
    : never;
};

type StaticGenRouteSource<TRoutes extends readonly AnyRouteConfig[]> =
  | {
      routes: TRoutes & StrictRouteConfigs<TRoutes>;
      registry?: never;
    }
  | {
      registry: RouteRegistry;
      routes?: never;
    };

interface SelectedRoute {
  descriptor: ResolvedRouteDescriptor;
  reason: RouteRenderReason;
  previous: IncrementalManifestRouteEntry | null;
}

type RuntimeOnlyRoute = {
  routeId: string;
  result: RouteRenderResult;
};

function getRuntimeOnlyDiagnostic(route: RouteConfig, path: string): string | null {
  const policies = route.policies ?? [];

  if (route.auth === true) {
    return `Skipped prerender for "${path}": authenticated routes are runtime-only by default.`;
  }

  if (route.role) {
    return `Skipped prerender for "${path}": role-gated routes are runtime-only by default.`;
  }

  if (route.permission) {
    return `Skipped prerender for "${path}": permission-gated routes are runtime-only by default.`;
  }

  if (policies.length > 0) {
    let hasAuthPolicy = false;
    let hasRolePolicy = false;
    let hasPermissionPolicy = false;

    for (const policy of policies) {
      const metadata = _getBuiltInRoutePolicy(policy);
      if (!metadata) {
        return `Skipped prerender for "${path}": routes with custom policies are runtime-only by default.`;
      }

      if (metadata.kind === 'auth') {
        hasAuthPolicy = true;
      } else if (metadata.kind === 'role') {
        hasRolePolicy = true;
      } else if (metadata.kind === 'permission') {
        hasPermissionPolicy = true;
      }
    }

    if (hasAuthPolicy) {
      return `Skipped prerender for "${path}": authenticated routes are runtime-only by default.`;
    }

    if (hasRolePolicy) {
      return `Skipped prerender for "${path}": role-gated routes are runtime-only by default.`;
    }

    if (hasPermissionPolicy) {
      return `Skipped prerender for "${path}": permission-gated routes are runtime-only by default.`;
    }

    return null;
  }

  return null;
}

function getRouteResultPath(route: RouteConfig): string {
  return route.params ? interpolateRoutePath(route.path, route.params) : route.path;
}

function createRuntimeOnlyRoute(
  route: RouteConfig,
  diagnostic: string
): RuntimeOnlyRoute {
  const path = getRouteResultPath(route);
  const filePath = getOutputFilePath(path);

  return {
    routeId: `${path}::${filePath}`,
    result: {
      path,
      filePath,
      html: '',
      fileSize: 0,
      renderDuration: 0,
      resourceCount: 0,
      status: 'skipped',
      reason: 'runtime-only',
      written: false,
      error: diagnostic,
    },
  };
}

async function splitStaticRoutes(routes: RouteConfig[]): Promise<{
  routes: RouteConfig[];
  runtimeOnly: RuntimeOnlyRoute[];
  outputRouteIds: string[];
}> {
  const prerenderableRoutes: RouteConfig[] = [];
  const runtimeOnly: RuntimeOnlyRoute[] = [];
  const outputRouteIds: string[] = [];

  for (const route of routes) {
    const routePath = getRouteResultPath(route);
    const diagnostic = getRuntimeOnlyDiagnostic(route, routePath);
    if (diagnostic) {
      const runtimeRoute = createRuntimeOnlyRoute(route, diagnostic);
      runtimeOnly.push(runtimeRoute);
      outputRouteIds.push(runtimeRoute.routeId);
      continue;
    }

    const expanded = await expandRoutes([route]);
    prerenderableRoutes.push(...expanded);
    for (const expandedRoute of expanded) {
      outputRouteIds.push(resolveRouteDescriptor(expandedRoute).routeId);
    }
  }

  return {
    routes: prerenderableRoutes,
    runtimeOnly,
    outputRouteIds,
  };
}

function resolveParallelism(requested: number | 'auto' | undefined): number {
  if (requested !== 'auto') {
    return Math.max(1, requested ?? 1);
  }

  const maybeNavigator = globalThis as typeof globalThis & {
    navigator?: { hardwareConcurrency?: number };
    process?: { env?: Record<string, string | undefined> };
  };

  const envWorkers = Number(
    maybeNavigator.process?.env?.ASKR_SSG_WORKERS ??
      maybeNavigator.process?.env?.NUMBER_OF_PROCESSORS ??
      maybeNavigator.process?.env?.UV_THREADPOOL_SIZE
  );
  if (Number.isFinite(envWorkers) && envWorkers > 0) {
    return Math.max(1, Math.trunc(envWorkers));
  }

  if (typeof maybeNavigator.navigator?.hardwareConcurrency === 'number') {
    return Math.max(1, maybeNavigator.navigator.hardwareConcurrency);
  }

  return 1;
}

function routeRegistryToRouteConfigs(registry: RouteRegistry): RouteConfig[] {
  const routeConfigs: RouteConfig[] = [];

  for (const record of registry.manifest.records) {
    if (record.isFallback) {
      continue;
    }

    routeConfigs.push({
      path: record.path,
      handler: record.handler,
      namespace: record.options.namespace,
      auth: record.options.auth,
      role: record.options.role,
      permission: record.options.permission,
      policies: stripRegistryGuestPolicies(record.options.policies),
      entries: record.options.entries,
    });
  }

  return routeConfigs;
}

function stripRegistryGuestPolicies(
  policies: readonly RoutePolicy[] | undefined
): readonly RoutePolicy[] | undefined {
  if (!policies || policies.length === 0) {
    return undefined;
  }

  const filtered = policies.filter(
    (policy) => _getBuiltInRoutePolicy(policy)?.kind !== 'guest'
  );

  return filtered.length > 0 ? filtered : undefined;
}

function normalizeStaticRoutes<TRoutes extends readonly AnyRouteConfig[]>(
  options: StaticGenRouteSource<TRoutes>
): RouteConfig[] {
  if (options.registry) {
    return routeRegistryToRouteConfigs(options.registry);
  }

  return [...(options.routes as readonly RouteConfig[])];
}

/**
 * Create a Static Site Generator
 *
 * Usage:
 * ```ts
 * const ssg = createStaticGen({
 *   routes: [
 *     { path: '/', component: HomePage },
 *     { path: '/about', component: AboutPage },
 *   ],
 *   outputDir: './dist',
 *   dataOverrides: {
 *     '/api/posts': { posts: [...] }
 *   }
 * });
 *
 * const result = await ssg.generate();
 * console.log(`Generated ${result.successful}/${result.totalRoutes} routes`);
 * ```
 */
export function createStaticGen<
  const TRoutes extends readonly AnyRouteConfig[],
>(
  options: Omit<SSGOptions<TRoutes>, 'routes' | 'registry'> &
    StaticGenRouteSource<TRoutes>
) {
  let result: SSGResult | null = null;
  const configuredRoutes = normalizeStaticRoutes(options);
  const seed = options.seed ?? 12345;
  const resolvedParallelism = resolveParallelism(options.parallelism);
  const resolvedConcurrency = Math.max(
    1,
    options.concurrency ?? resolvedParallelism
  );

  if (configuredRoutes.length === 0) {
    throw new Error('routes array or route registry is required');
  }

  if (!options.outputDir || options.outputDir.trim().length === 0) {
    throw new Error('outputDir is required');
  }

  return {
    /**
     * Generate static HTML for all routes
     * Writes to outputDir with metadata.json
     * Returns detailed results
     */
    async generate(
      generateOptions: SSGGenerateOptions = {}
    ): Promise<SSGResult> {
      const splitRoutes = await splitStaticRoutes(configuredRoutes);
      const routes = splitRoutes.routes;
      validateRoutes(routes);

      const changedKeys = dedupeStrings(generateOptions.changedKeys);
      const changedRoutes = dedupeStrings(generateOptions.changedRoutes);
      const requestedMode = generateOptions.mode ?? 'full';
      const previousManifest =
        !generateOptions.forceFull && requestedMode === 'incremental'
          ? readIncrementalManifest(options.outputDir, seed)
          : null;
      const effectiveMode: SSGMode =
        generateOptions.forceFull ||
        requestedMode !== 'incremental' ||
        previousManifest === null
          ? 'full'
          : 'incremental';

      // Resolve data
      const dataMap = resolveSsgData(routes, {
        dataOverrides: options.dataOverrides,
      });

      const descriptors = routes.map(resolveRouteDescriptor);
      const routeResultsById = new Map<string, RouteRenderResult>();
      for (const runtimeRoute of splitRoutes.runtimeOnly) {
        routeResultsById.set(runtimeRoute.routeId, runtimeRoute.result);
      }
      const eligibleDescriptors = descriptors;

      const previousEntries = new Map(
        (previousManifest?.routes ?? []).map((entry) => [entry.routeId, entry])
      );
      const currentRouteIds = new Set(
        eligibleDescriptors.map((descriptor) => descriptor.routeId)
      );

      const selected: SelectedRoute[] = [];
      const routesToRender: SelectedRoute[] = [];
      for (let index = 0; index < eligibleDescriptors.length; index += 1) {
        const descriptor = eligibleDescriptors[index];
        const entry = selectRouteForGeneration(
          descriptor,
          previousEntries.get(descriptor.routeId) ?? null,
          effectiveMode,
          changedKeys,
          changedRoutes
        );
        selected.push(entry);
        if (entry.reason !== 'unchanged') {
          routesToRender.push(entry);
        }
      }
      const renderStartTime = performance.now();
      incrementPerfMetric('ssgWorkerCount', resolvedParallelism);
      const renderedResults =
        routesToRender.length > 0
          ? await batchRenderRoutes(getRoutesToRender(routesToRender), {
              seed,
              dataMap,
              concurrency: resolvedConcurrency,
              document: options.document,
            })
          : [];
      addPerfDuration('ssgRenderTimeMs', performance.now() - renderStartTime);
      const renderedByRouteId = new Map<string, RouteRenderResult>();
      for (let index = 0; index < renderedResults.length; index += 1) {
        renderedByRouteId.set(
          routesToRender[index].descriptor.routeId,
          renderedResults[index]
        );
      }

      let cacheHits = 0;
      const nextManifestRoutes: IncrementalManifestRouteEntry[] = [];

      for (const entry of selected) {
        const { descriptor, previous, reason } = entry;
        const resolvedData = resolveSsgRouteData(
          dataMap,
          descriptor.route.path,
          descriptor.path
        );
        const baseData = resolvedData.hasData ? resolvedData.data : undefined;
        const resourceCount =
          resolvedData.hasData && baseData ? Object.keys(baseData).length : 0;

        if (reason === 'unchanged') {
          routeResultsById.set(descriptor.routeId, {
            path: descriptor.path,
            filePath: descriptor.filePath,
            html: '',
            fileSize:
              previous?.htmlHash !== null && previous !== null
                ? getExistingOutputFileSize(
                    options.outputDir,
                    descriptor.filePath
                  )
                : 0,
            renderDuration: 0,
            resourceCount,
            status: 'skipped',
            reason: 'unchanged',
            written: false,
          });

          if (previous) {
            nextManifestRoutes.push({
              ...previous,
              path: descriptor.path,
              filePath: descriptor.filePath,
              invalidationKeys: descriptor.invalidationKeys.slice(),
            });
          }
          continue;
        }

        const rendered = renderedByRouteId.get(descriptor.routeId);
        if (!rendered) {
          throw new Error(
            `Missing rendered result for route "${descriptor.path}"`
          );
        }

        const nextResult: RouteRenderResult = {
          ...rendered,
          path: descriptor.path,
          filePath: descriptor.filePath,
          resourceCount,
          reason,
          written: false,
        };

        if (nextResult.status === 'success') {
          const htmlDigest = hashHtml(nextResult.html);
          const shouldWrite =
            effectiveMode === 'full' ||
            !previous ||
            previous.htmlHash !== htmlDigest ||
            !outputFileExists(options.outputDir, descriptor.filePath);

          nextResult.written = shouldWrite;
          if (!shouldWrite) {
            cacheHits += 1;
          }

          nextManifestRoutes.push({
            routeId: descriptor.routeId,
            path: descriptor.path,
            filePath: descriptor.filePath,
            invalidationKeys: descriptor.invalidationKeys.slice(),
            htmlHash: htmlDigest,
            lastStatus: 'success',
          });
        } else {
          nextManifestRoutes.push({
            routeId: descriptor.routeId,
            path: descriptor.path,
            filePath: descriptor.filePath,
            invalidationKeys: descriptor.invalidationKeys.slice(),
            htmlHash: previous?.htmlHash ?? null,
            lastStatus: 'error',
          });
        }

        routeResultsById.set(descriptor.routeId, nextResult);
      }

      const removedResults = collectRemovedRouteResults(
        previousManifest,
        currentRouteIds
      );
      const routeResults: RouteRenderResult[] = [];
      for (const routeId of splitRoutes.outputRouteIds) {
        const routeResult = routeResultsById.get(routeId);
        if (routeResult) {
          routeResults.push(routeResult);
        }
      }
      routeResults.push(...removedResults);

      // Write HTML files to disk and remove stale output
      const writeStartTime = performance.now();
      await writeStaticFiles(routeResults, options.outputDir, {
        concurrency: resolvedConcurrency,
      });
      addPerfDuration('ssgWriteTimeMs', performance.now() - writeStartTime);

      // Generate result object
      result = generateSSGResult(routeResults, {
        mode: effectiveMode,
        cacheHits,
        invalidatedKeys: changedKeys,
        invalidatedRoutes: changedRoutes,
      });

      // Write metadata
      const metadata = resultToMetadata(result);
      await writeMetadata(metadata, options.outputDir);

      await writeIncrementalManifest(
        {
          schemaVersion: SSG_MANIFEST_SCHEMA_VERSION,
          seed,
          mode: effectiveMode,
          routes: nextManifestRoutes,
        },
        options.outputDir
      );

      return result;
    },

    /**
     * Get effective config in a serializable form for diagnostics.
     */
    getConfig() {
      return {
        routeCount: configuredRoutes.length,
        outputDir: options.outputDir,
        seed,
        concurrency: resolvedConcurrency,
        parallelism: resolvedParallelism,
        hasDataOverrides: !!options.dataOverrides,
      };
    },

    /**
     * Get the last generation result
     * Returns null if generate() hasn't been called
     */
    getResult(): SSGResult | null {
      return result;
    },
  };
}

function dedupeStrings(values?: string[]): string[] {
  return values ? Array.from(new Set(values)) : [];
}

function getRoutesToRender(selected: SelectedRoute[]): RouteConfig[] {
  const routes: RouteConfig[] = [];
  for (let index = 0; index < selected.length; index += 1) {
    routes.push(selected[index].descriptor.route);
  }
  return routes;
}

function selectRouteForGeneration(
  descriptor: ResolvedRouteDescriptor,
  previous: IncrementalManifestRouteEntry | null,
  mode: SSGMode,
  changedKeys: string[],
  changedRoutes: string[]
): SelectedRoute {
  if (mode === 'full') {
    return { descriptor, reason: 'full', previous };
  }

  if (!previous) {
    return { descriptor, reason: 'new-route', previous };
  }

  if (previous.lastStatus === 'error' || previous.htmlHash === null) {
    return { descriptor, reason: 'new-route', previous };
  }

  if (descriptor.invalidationKeys.length === 0) {
    return { descriptor, reason: 'no-keys', previous };
  }

  if (changedRoutes.includes(descriptor.path)) {
    return { descriptor, reason: 'changed-route', previous };
  }

  if (descriptor.invalidationKeys.some((key) => changedKeys.includes(key))) {
    return { descriptor, reason: 'changed-key', previous };
  }

  return { descriptor, reason: 'unchanged', previous };
}

function collectRemovedRouteResults(
  manifest: IncrementalManifest | null,
  currentRouteIds: Set<string>
): RouteRenderResult[] {
  if (!manifest) {
    return [];
  }

  const results: RouteRenderResult[] = [];
  for (let index = 0; index < manifest.routes.length; index += 1) {
    const entry = manifest.routes[index];
    if (currentRouteIds.has(entry.routeId)) {
      continue;
    }
    results.push({
      path: entry.path,
      filePath: entry.filePath,
      html: '',
      fileSize: 0,
      renderDuration: 0,
      resourceCount: 0,
      status: 'removed' as const,
      reason: 'deleted' as const,
      written: false,
    });
  }

  return results;
}
