/**
 * Static Site Generation API
 *
 * Main orchestrator for batch rendering, file I/O, and metadata generation
 */

import type { SSGOptions, SSGResult } from './types';
import { resolveSsgData, validateRoutes } from './resolve-ssg-data';
import { batchRenderRoutes } from './batch-render';
import { writeStaticFiles } from './write-static-files';
import {
  generateSSGResult,
  resultToMetadata,
  writeMetadata,
} from './generate-metadata';

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

  return {
    /**
     * Generate static HTML for all routes
     * Writes to outputDir with metadata.json
     * Returns detailed results
     */
    async generate(): Promise<SSGResult> {
      // Validate input
      validateRoutes(options.routes);

      // Resolve data
      const dataMap = resolveSsgData(options.routes, {
        dataOverrides: options.dataOverrides,
      });

      // Render all routes in parallel
      const renderResults = await batchRenderRoutes(options.routes, {
        seed: options.seed,
        dataMap,
        concurrency: options.concurrency ?? 10,
      });

      // Write HTML files to disk
      await writeStaticFiles(renderResults, options.outputDir);

      // Generate result object
      result = generateSSGResult(renderResults);

      // Write metadata
      const metadata = resultToMetadata(result);
      await writeMetadata(metadata, options.outputDir);

      return result;
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
