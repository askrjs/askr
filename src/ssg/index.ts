/**
 * Static Site Generation (SSG)
 *
 * Generate static HTML files from Askr routes at build time.
 *
 * @example
 * ```ts
 * import { createStaticGen } from '@askrjs/askr/ssg';
 *
 * const ssg = createStaticGen({
 *   routes: [
 *     { path: '/', component: HomePage },
 *     { path: '/about', component: AboutPage },
 *   ],
 *   outputDir: './dist',
 * });
 *
 * const result = await ssg.generate();
 * console.log(`Generated ${result.successful} routes`);
 * ```
 */

export { createStaticGen } from './create-static-gen';
export type {
  RouteConfig,
  SSGOptions,
  SSGResult,
  SSGMetadata,
  RouteRenderResult,
  DiscoveredResources,
} from './types';

// Internal utilities available for advanced use cases
export { batchRenderRoutes } from './batch-render';
export { writeStaticFiles, getOutputFilePath } from './write-static-files';
export {
  generateSSGResult,
  resultToMetadata,
  writeMetadata,
} from './generate-metadata';
export { resolveSsgData, validateRoutes } from './resolve-ssg-data';
