/**
 * Static Site Generation API
 *
 * Main orchestrator for batch rendering, file I/O, and metadata generation
 */

import type {
  RouteRenderReason,
  RouteRenderResult,
  SSGGenerateOptions,
  SSGMode,
  SSGOptions,
  SSGResult,
} from './types';
import { resolveSsgData, validateRoutes } from './resolve-ssg-data';
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
  resolveRouteDescriptor,
  type ResolvedRouteDescriptor,
} from './route-utils';
import { addPerfDuration } from '../runtime/perf-metrics';

interface SelectedRoute {
  descriptor: ResolvedRouteDescriptor;
  reason: RouteRenderReason;
  previous: IncrementalManifestRouteEntry | null;
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
export function createStaticGen(options: SSGOptions) {
  let result: SSGResult | null = null;
  const seed = options.seed ?? 12345;

  if (!Array.isArray(options.routes) || options.routes.length === 0) {
    throw new Error('routes array is required');
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
      // Validate input
      validateRoutes(options.routes);

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
      const dataMap = resolveSsgData(options.routes, {
        dataOverrides: options.dataOverrides,
      });

      const descriptors = options.routes.map(resolveRouteDescriptor);
      const previousEntries = new Map(
        (previousManifest?.routes ?? []).map((entry) => [entry.routeId, entry])
      );
      const currentRouteIds = new Set(
        descriptors.map((descriptor) => descriptor.routeId)
      );

      const selected = descriptors.map((descriptor) =>
        selectRouteForGeneration(
          descriptor,
          previousEntries.get(descriptor.routeId) ?? null,
          effectiveMode,
          changedKeys,
          changedRoutes
        )
      );

      const routesToRender = selected.filter(
        (entry) => entry.reason !== 'unchanged'
      );
      const renderStartTime = performance.now();
      const renderedResults =
        routesToRender.length > 0
          ? await batchRenderRoutes(
              routesToRender.map((entry) => entry.descriptor.route),
              {
                seed,
                dataMap,
                concurrency: options.concurrency ?? 10,
              }
            )
          : [];
      addPerfDuration('ssgRenderTimeMs', performance.now() - renderStartTime);
      const renderedByRouteId = new Map(
        renderedResults.map((rendered, index) => [
          routesToRender[index].descriptor.routeId,
          rendered,
        ])
      );

      let cacheHits = 0;
      const routeResults: RouteRenderResult[] = [];
      const nextManifestRoutes: IncrementalManifestRouteEntry[] = [];

      for (const entry of selected) {
        const { descriptor, previous, reason } = entry;
        const baseData =
          dataMap[descriptor.route.path] ?? dataMap[descriptor.path] ?? {};
        const resourceCount = Object.keys(baseData).length;

        if (reason === 'unchanged') {
          routeResults.push({
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

        routeResults.push(nextResult);
      }

      const removedResults = collectRemovedRouteResults(
        previousManifest,
        currentRouteIds
      );
      routeResults.push(...removedResults);

      // Write HTML files to disk and remove stale output
      const writeStartTime = performance.now();
      await writeStaticFiles(routeResults, options.outputDir, {
        concurrency: options.concurrency ?? 10,
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
        routeCount: options.routes.length,
        outputDir: options.outputDir,
        seed,
        concurrency: options.concurrency ?? 10,
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

  return manifest.routes
    .filter((entry) => !currentRouteIds.has(entry.routeId))
    .map((entry) => ({
      path: entry.path,
      filePath: entry.filePath,
      html: '',
      fileSize: 0,
      renderDuration: 0,
      resourceCount: 0,
      status: 'removed' as const,
      reason: 'deleted' as const,
      written: false,
    }));
}
