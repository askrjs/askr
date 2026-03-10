/**
 * Batch rendering of multiple routes for SSG
 */

import { renderToStringSyncForUrl } from '../ssr';
import type { RouteConfig, RouteRenderResult } from './types';
import type { RouteHandler } from '../common/router';
import type { ComponentFunction } from '../common/component';
import type { SSRData } from '../common/ssr';
import { getOutputFilePath, interpolateRoutePath } from './route-utils';

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
  const { seed = 12345, dataMap = {}, concurrency = 1 } = options;

  const workerCount = Math.max(1, Math.min(concurrency, routes.length || 1));
  const results = new Array<RouteRenderResult>(routes.length);
  let nextIndex = 0;

  const renderOne = async (route: RouteConfig): Promise<RouteRenderResult> => {
    const startTime = performance.now();
    const url = interpolateRoutePath(route.path, route.params);
    const baseData = dataMap[route.path] ?? dataMap[url] ?? {};

    const mergedHandler: RouteHandler = route.handler
      ? route.handler
      : (params, ctx?: unknown) => {
          const component = route.component as ComponentFunction;
          return component(
            { ...(route.props || {}), ...(params || {}) },
            ctx as { signal: AbortSignal; ssr?: unknown }
          );
        };

    try {
      const html = renderToStringSyncForUrl({
        url,
        routes: [
          {
            path: route.path,
            handler: mergedHandler,
            namespace: route.namespace,
          },
        ],
        options: {
          seed,
          data: baseData,
        },
      });

      const duration = performance.now() - startTime;
      return {
        path: url,
        filePath: getOutputFilePath(url),
        html,
        fileSize: Buffer.byteLength(html, 'utf8'),
        renderDuration: Math.round(duration),
        resourceCount: Object.keys(baseData).length,
        status: 'success',
        reason: 'full',
        written: false,
      };
    } catch (error) {
      const duration = performance.now() - startTime;
      return {
        path: url,
        filePath: getOutputFilePath(url),
        html: '',
        fileSize: 0,
        renderDuration: Math.round(duration),
        resourceCount: Object.keys(baseData).length,
        status: 'error',
        reason: 'full',
        written: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  };

  const worker = async () => {
    while (true) {
      const current = nextIndex;
      nextIndex += 1;
      if (current >= routes.length) return;
      results[current] = await renderOne(routes[current]);
    }
  };

  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}
