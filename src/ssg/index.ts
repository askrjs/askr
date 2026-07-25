/**
 * Static Site Generation (SSG)
 *
 * Generate static HTML files from Askr routes at build time.
 *
 * @example
 * ```ts
 * import { createStaticGen } from '@askrjs/askr/ssg';
 *
 * const registry = createRouteRegistry(() => {
 *   route('/', HomePage);
 *   route('/about', AboutPage);
 * });
 * const ssg = createStaticGen({
 *   registry,
 *   outputDir: './dist',
 * });
 *
 * const result = await ssg.generate();
 * console.log(`Generated ${result.successful} routes`);
 * ```
 */

export { createStaticGen } from './create-static-gen';
export type {
  DocumentRenderArgs,
  DocumentRenderContext,
  DocumentRenderer,
} from '../common/ssr';
export type {
  RouteConfig,
  RouteRenderReason,
  SSGOptions,
  SSGGenerateOptions,
  SSGMode,
  SSGResult,
  SSGMetadata,
  RouteRenderResult,
  RouteRenderStatus,
  DiscoveredResources,
  SSGAssetSource,
} from './types';
