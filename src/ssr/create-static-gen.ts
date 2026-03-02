/**
 * Static Site Generation (SSG) Core
 *
 * Orchestrates the source-to-disk generation pipeline.
 * Coordinates route discovery, data resolution, batch rendering,
 * file I/O, and metadata generation.
 */

import type {
  SSGOptions,
  SSGResult,
  SSGRouteConfig,
  SSGRouteResult,
} from './static-gen-types';
import { batchRender } from './batch-render';
import { discoverResources } from './discover-resources';
import { resolveSSGData } from './resolve-ssg-data';
import { writeHTMLFile, writeMetadataFile, validateOutputDir } from './write-static-files';
import { generateMetadata } from './generate-metadata';

/**
 * Create an SSG generator for a set of routes.
 *
 * Usage:
 * ```ts
 * const ssg = createStaticGen({
 *   routes: [
 *     { path: "/", handler: Index },
 *     { path: "/about", handler: About },
 *     { path: "/blog/{slug}", handler: BlogPost, params: { slug: "hello-world" } },
 *   ],
 *   outputDir: "./dist/static",
 *   dataOverrides: {
 *     "blog-posts": await fetchAllPosts(),
 *   },
 * });
 *
 * const result = await ssg.generate();
 * console.log(result.metadata);
 * ```
 *
 * @param options SSG configuration
 * @returns SSG generator instance
 */
export function createStaticGen(options: SSGOptions) {
  const {
    routes,
    outputDir,
    seed = 12345,
    dataOverrides,
    includeResources = true,
  } = options;

  // Validate inputs
  if (!routes || routes.length === 0) {
    throw new Error('createStaticGen: routes array is required and must not be empty');
  }

  if (!outputDir) {
    throw new Error('createStaticGen: outputDir is required');
  }

  return {
    /**
     * Generate static HTML for all routes and write to disk.
     *
     * @returns Promise resolving to SSGResult with metadata and per-route results
     */
    async generate(): Promise<SSGResult> {
      validateOutputDir(outputDir);

      // Discover resources used by routes (if enabled)
      let discoveredResources = null;
      if (includeResources) {
        // Note: full resource discovery requires integration with render-keys.ts
        // For now, we skip this as resources are matched dynamically during render
        discoveredResources = null;
      }

      // Resolve data: merge discovered + user overrides
      const data = resolveSSGData(discoveredResources, dataOverrides);

      // Render all routes concurrently
      const routeResults = await batchRender(routes, outputDir, data, seed);

      // Write HTML files to disk
      for (const result of routeResults) {
        if (result.status === 'success') {
          writeHTMLFile(outputDir, result.filePath, result.html);
        }
      }

      // Generate and write metadata
      const metadata = generateMetadata(routeResults);
      writeMetadataFile(outputDir, metadata);

      return {
        metadata,
        routes: routeResults,
        success: metadata.failed === 0,
      };
    },

    /**
     * Get the current configuration.
     * Useful for logging or debugging.
     *
     * @returns Generator configuration summary
     */
    getConfig() {
      return {
        routeCount: routes.length,
        outputDir,
        seed,
        hasDataOverrides: !!dataOverrides && Object.keys(dataOverrides).length > 0,
        includeResources,
      };
    },

    /**
     * Get route configuration for reference.
     *
     * @returns Array of route configs
     */
    getRoutes() {
      return routes;
    },
  };
}

/**
 * Type of the generator returned by createStaticGen
 */
export type StaticSiteGenerator = ReturnType<typeof createStaticGen>;
