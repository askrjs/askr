/**
 * Batch rendering of multiple routes for SSG
 */

import { renderToString } from '../ssr';
import { renderDocument, type DocumentRenderer } from '../common/ssr';
import type { RouteConfig, RouteRenderResult } from './types';
import type { RouteHandler } from '../common/router';
import type { ComponentFunction } from '../common/component';
import type { SSRData } from '../common/ssr';
import { resolveSsgRouteData } from './resolve-ssg-data';
import { getOutputFilePath, interpolateRoutePath } from './route-utils';

interface BatchRenderOptions {
  seed?: number;
  dataMap?: Record<string, SSRData>;
  concurrency?: number;
  document?: DocumentRenderer;
}

/**
 * Render multiple routes in parallel with error handling
 */
export async function batchRenderRoutes(
  routes: RouteConfig[],
  options: BatchRenderOptions = {}
): Promise<RouteRenderResult[]> {
  const { seed = 12345, dataMap = {}, concurrency = 1, document } = options;

  const workerCount = Math.max(1, Math.min(concurrency, routes.length || 1));
  const results: RouteRenderResult[] = [];
  results.length = routes.length;
  let nextIndex = 0;

  const renderOne = async (route: RouteConfig): Promise<RouteRenderResult> => {
    const startTime = performance.now();
    const url = interpolateRoutePath(route.path, route.params);
    const requestUrl = new URL(url, 'http://localhost');
    const resolvedData = resolveSsgRouteData(dataMap, route.path, url);
    const baseData = resolvedData.hasData ? resolvedData.data : undefined;
    const resourceCount =
      resolvedData.hasData && baseData ? Object.keys(baseData).length : 0;

    const mergedHandler: RouteHandler = route.handler
      ? route.handler
      : (params, ctx?: unknown) => {
          const component = route.component as ComponentFunction;
          return component(
            { ...route.props, ...params },
            ctx as { signal: AbortSignal; ssr?: unknown }
          );
        };

    try {
      const routeEntry = {
        path: route.path,
        handler: mergedHandler,
        namespace: route.namespace,
      };

      const html = renderToString({
        url,
        routes: [routeEntry],
        seed,
        data: baseData,
        document:
          document === undefined
            ? undefined
            : ({ appHtml }) =>
                renderDocument(
                  document,
                  {
                    appHtml,
                    context: {
                      mode: 'ssg',
                      url,
                      pathname: requestUrl.pathname,
                      search: requestUrl.search,
                      hash: requestUrl.hash,
                      params: route.params ?? {},
                      data: baseData,
                      seed,
                      route: {
                        path: route.path,
                        namespace: route.namespace,
                      },
                    },
                  },
                  'createStaticGen()'
                ),
      });

      const duration = performance.now() - startTime;
      return {
        path: url,
        filePath: getOutputFilePath(url),
        html,
        fileSize: Buffer.byteLength(html, 'utf8'),
        renderDuration: Math.round(duration),
        resourceCount,
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
        resourceCount,
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
