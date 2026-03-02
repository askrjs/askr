/**
 * Batch Rendering for SSG
 *
 * Renders multiple routes concurrently with safe error handling.
 */

import { renderToStringSyncForUrl } from './index';
import type { SSRData } from '../common/ssr';
import type { SSGRouteConfig, SSGRouteResult } from './static-gen-types';
import type { RouteHandler } from '../common/router';

/**
 * Render multiple routes concurrently and return per-route results.
 *
 * Uses Promise.allSettled() to render routes in parallel without blocking
 * on individual failures. Each route is rendered independently with its own
 * SSRData and seed.
 *
 * @param routes Array of routes to render
 * @param outputDir Output directory (used in result, not for file writing)
 * @param data SSRData to use for all routes
 * @param seed Deterministic seed
 * @returns Array of per-route results
 */
export async function batchRender(
  routes: SSGRouteConfig[],
  outputDir: string,
  data: SSRData,
  seed: number
): Promise<SSGRouteResult[]> {
  // Map each route to a render task
  const tasks = routes.map(async (route) => {
    const startTime = performance.now();

    try {
      // Construct the full URL for the route
      const url = route.params
        ? interpolateParams(route.path, route.params)
        : route.path;

      // Render the route using the existing SSR function
      const html = renderToStringSyncForUrl({
        url,
        routes: [route],
        options: {
          seed,
          data,
        },
      });

      const duration = performance.now() - startTime;
      const fileSize = Buffer.byteLength(html, 'utf8');
      const filePath = constructFilePath(url);

      return {
        route: url,
        html,
        filePath,
        fileSize,
        renderDuration: Math.round(duration),
        resourceCount: countResources(data),
        status: 'success' as const,
      };
    } catch (error) {
      const duration = performance.now() - startTime;
      return {
        route: route.path,
        html: '',
        filePath: constructFilePath(route.path),
        fileSize: 0,
        renderDuration: Math.round(duration),
        resourceCount: 0,
        status: 'error' as const,
        error: error instanceof Error ? error : new Error(String(error)),
      };
    }
  });

  // Render all routes concurrently
  const results = await Promise.allSettled(tasks);

  // Extract settled results
  return results.map((result) => {
    if (result.status === 'fulfilled') {
      return result.value;
    }
    // allSettled should never reject, but handle it just in case
    return {
      route: 'unknown',
      html: '',
      filePath: 'unknown/index.html',
      fileSize: 0,
      renderDuration: 0,
      resourceCount: 0,
      status: 'error' as const,
      error: result.reason instanceof Error ? result.reason : new Error(String(result.reason)),
    };
  });
}

/**
 * Interpolate route parameters into a path template.
 *
 * Example: interpolateParams("/blog/{slug}", { slug: "hello-world" })
 *          => "/blog/hello-world"
 *
 * @param path Path template with {param} placeholders
 * @param params Parameter values
 * @returns Interpolated path
 */
function interpolateParams(path: string, params: Record<string, string>): string {
  let result = path;
  for (const [key, value] of Object.entries(params)) {
    result = result.replace(`{${key}}`, value);
  }
  return result;
}

/**
 * Convert a URL path to an output file path.
 *
 * Examples:
 *   "/" => "index.html"
 *   "/blog/post-1" => "blog/post-1/index.html"
 *   "/about/" => "about/index.html"
 *
 * @param url URL path
 * @returns Relative file path
 */
function constructFilePath(url: string): string {
  // Normalize: remove leading slash, trailing slash
  let normalized = url.startsWith('/') ? url.slice(1) : url;
  normalized = normalized.endsWith('/') ? normalized.slice(0, -1) : normalized;

  // Root path
  if (normalized === '') {
    return 'index.html';
  }

  return `${normalized}/index.html`;
}

/**
 * Count the number of resource keys in the data object.
 *
 * @param data SSRData object
 * @returns Number of keys
 */
function countResources(data: Record<string, unknown>): number {
  return Object.keys(data).length;
}
