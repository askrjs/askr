/**
 * Static Site Generation API
 *
 * Main orchestrator for batch rendering, file I/O, and metadata generation
 */

import type {
  RouteRenderResult,
  SSGGenerateOptions,
  SSGMode,
  SSGOptions,
  SSGResult,
} from './types';
import * as fs from 'node:fs/promises';
import { resolveParallelism } from './parallelism';
import {
  withOutputDirectoryLock,
  createStagingDirectory,
  copyStaticAssets,
  replaceOutputDirectory,
} from './output-publication';
export { replaceOutputDirectory } from './output-publication';
import {
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
  type IncrementalManifestRouteEntry,
  writeIncrementalManifest,
  hashHtml,
  SSG_MANIFEST_SCHEMA_VERSION,
} from './incremental-manifest';
import {
  resolveRouteDescriptor,
  validateOutputPathCollisions,
} from './route-utils';
import {
  collectRemovedRouteResults,
  dedupeStrings,
  getRoutesToRender,
  selectRouteForGeneration,
  type SelectedRoute,
} from './generation-plan';
import { normalizeStaticRoutes, splitStaticRoutes } from './static-routes';
import { addPerfDuration, incrementPerfMetric } from '../runtime';

/**
 * Create a Static Site Generator
 *
 * Usage:
 * ```ts
 * const ssg = createStaticGen({
 *   registry,
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
  if (!options || !('registry' in options) || !options.registry) {
    throw new Error('route registry is required');
  }
  const configuredRoutes = normalizeStaticRoutes(options);
  const seed = options.seed ?? 12345;
  const resolvedParallelism = resolveParallelism(options.parallelism);
  const resolvedConcurrency = Math.max(
    1,
    options.concurrency ?? resolvedParallelism
  );

  if (configuredRoutes.length === 0) {
    throw new Error('route registry is required');
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
      return withOutputDirectoryLock(options.outputDir, async () => {
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
        validateOutputPathCollisions(descriptors);
        const routeResultsById = new Map<string, RouteRenderResult>();
        for (const runtimeRoute of splitRoutes.runtimeOnly) {
          routeResultsById.set(runtimeRoute.routeId, runtimeRoute.result);
        }
        const eligibleDescriptors = descriptors;

        const previousEntries = new Map(
          (previousManifest?.routes ?? []).map((entry) => [
            entry.routeId,
            entry,
          ])
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
                styleRegistrationValidation:
                  options.styleRegistrationValidation,
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

        // Generate result object
        result = generateSSGResult(routeResults, {
          mode: effectiveMode,
          cacheHits,
          invalidatedKeys: changedKeys,
          invalidatedRoutes: changedRoutes,
        });

        // A full build is all-or-nothing. Do not touch the current output until
        // every route has rendered successfully.
        if (effectiveMode === 'full' && result.failed > 0) {
          for (const routeResult of result.routes) {
            if (routeResult.status === 'success') {
              routeResult.written = false;
            }
          }
          return result;
        }

        const targetOutputDir =
          effectiveMode === 'full'
            ? await createStagingDirectory(options.outputDir)
            : options.outputDir;

        try {
          // Write HTML, metadata, and the manifest into the same target. Full
          // builds use a sibling staging directory; incremental builds retain
          // their existing per-route behavior.
          const writeStartTime = performance.now();
          await writeStaticFiles(routeResults, targetOutputDir, {
            concurrency: resolvedConcurrency,
          });
          addPerfDuration('ssgWriteTimeMs', performance.now() - writeStartTime);

          const metadata = resultToMetadata(result);
          await writeMetadata(metadata, targetOutputDir);

          await writeIncrementalManifest(
            {
              schemaVersion: SSG_MANIFEST_SCHEMA_VERSION,
              seed,
              mode: effectiveMode,
              routes: nextManifestRoutes,
            },
            targetOutputDir
          );

          await copyStaticAssets(options.assets, targetOutputDir);

          if (effectiveMode === 'full') {
            await replaceOutputDirectory(targetOutputDir, options.outputDir);
          }
        } catch (error) {
          if (effectiveMode === 'full') {
            try {
              await fs.rm(targetOutputDir, { recursive: true, force: true });
            } catch {
              // Preserve the failure that initiated staging cleanup.
            }
          }
          throw error;
        }

        return result;
      });
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
        assetCount: options.assets?.length ?? 0,
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
