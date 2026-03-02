/**
 * Batch rendering of multiple routes for SSG
 */

import { renderToStringSyncForUrl } from '../ssr';
import type { RouteConfig, RouteRenderResult } from './types';
import type { RouteHandler } from '../common/router';
import type { SSRData } from '../common/ssr';

interface BatchRenderOptions {
  seed?: number;
  dataMap?: Record<string, SSRData>;
  concurrency?: number;
}

/**
 * Render multiple routes in parallel with error handling
 */
export async function batchRenderRoutes(
  routes: RouteConfig[],
  options: BatchRenderOptions = {}
): Promise<RouteRenderResult[]> {
  const { seed = 12345, dataMap = {}, concurrency = 10 } = options;

  // Convert routes to SSR format
  const ssrRoutes = routes.map((r) => ({
    path: r.path,
    handler: r.component as RouteHandler,
  }));

  // Render with concurrency control
  const results: RouteRenderResult[] = [];
  const promises: Promise<void>[] = [];

  let index = 0;

  const renderOne = async (route: RouteConfig, ssrRoute: typeof ssrRoutes[0]) => {
    const startTime = performance.now();

    try {
      const html = renderToStringSyncForUrl({
        url: route.path,
        routes: [ssrRoute],
        options: {
          seed,
          data: dataMap[route.path],
        },
      });

      const duration = performance.now() - startTime;

      results.push({
        path: route.path,
        filePath: pathToFilePath(route.path),
        html,
        fileSize: Buffer.byteLength(html, 'utf8'),
        renderDuration: Math.round(duration),
        resourceCount: 0, // TODO: track during render
        status: 'success',
      });
    } catch (error) {
      const duration = performance.now() - startTime;
      const message =
        error instanceof Error ? error.message : String(error);

      results.push({
        path: route.path,
        filePath: pathToFilePath(route.path),
        html: '',
        fileSize: 0,
        renderDuration: Math.round(duration),
        resourceCount: 0,
        status: 'error',
        error: message,
      });
    }
  };

  // Submit tasks with concurrency limit
  for (const route of routes) {
    const ssrRoute = ssrRoutes[routes.indexOf(route)];

    // Wait if we hit concurrency limit
    if (promises.length >= concurrency) {
      await Promise.race(promises);
      promises.splice(
        promises.findIndex((p) => p.then?.length === 0),
        1
      );
    }

    const promise = renderOne(route, ssrRoute).finally(() => {
      const idx = promises.indexOf(promise);
      if (idx !== -1) promises.splice(idx, 1);
    });

    promises.push(promise);
  }

  // Wait for all remaining
  await Promise.all(promises);

  return results;
}

/**
 * Convert URL path to file path
 * E.g., "/blog/post" -> "blog/post" or "/" -> ""
 */
function pathToFilePath(path: string): string {
  if (path === '/') return '';
  return path.replace(/^\/|\/$/g, '');
}
