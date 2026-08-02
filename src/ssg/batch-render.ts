/**
 * Batch rendering of multiple routes for SSG
 */

import { renderToString } from '../ssr';
import {
  renderDocument,
  type DocumentRenderer,
  type SSRStyleRegistrationValidation,
} from '../common/ssr';
import type { RouteConfig, RouteRenderResult } from './types';
import type { RouteHandler } from '../common/router';
import type { RouteContext } from '../common/router';
import { createRouteRegistry, route as defineRoute } from '../router/route';
import type { SSRData } from '../common/ssr';
import { resolveSsgRouteData } from './resolve-ssg-data';
import { getOutputFilePath, interpolateRoutePath } from './route-utils';
import { resolveDeferredValues } from '../router/deferred';
import { bindResolvedRouteData } from '../router/resolution';
import { _preloadRouteHandler } from '../router/lazy';
import { prepareRouteHydrationData } from '../router/route-hydration';
import { addRouteBasePath } from '../router/base-path';

interface BatchRenderOptions {
  seed?: number;
  dataMap?: Record<string, SSRData>;
  concurrency?: number;
  document?: DocumentRenderer;
  styleRegistrationValidation?: SSRStyleRegistrationValidation;
}

/**
 * Render multiple routes in parallel with error handling
 */
export async function batchRenderRoutes(
  routes: RouteConfig[],
  options: BatchRenderOptions = {}
): Promise<RouteRenderResult[]> {
  const {
    seed = 12345,
    dataMap = {},
    concurrency = 1,
    document,
    styleRegistrationValidation = 'warn',
  } = options;

  const workerCount = Math.max(1, Math.min(concurrency, routes.length || 1));
  const results: RouteRenderResult[] = [];
  results.length = routes.length;
  let nextIndex = 0;
  const hasUniquePaths =
    new Set(routes.map((route) => route.path)).size === routes.length;
  const basePaths = new Set(routes.map((route) => route.basePath ?? ''));
  const sharedBasePath = basePaths.size === 1 ? routes[0]?.basePath : undefined;
  const sharedRegistry =
    hasUniquePaths && basePaths.size <= 1
      ? createRouteRegistry(
          () => {
            for (const route of routes) {
              defineRoute(route.path, route.handler, {
                namespace: route.namespace,
              });
            }
          },
          { basePath: sharedBasePath }
        )
      : undefined;

  const renderOne = async (route: RouteConfig): Promise<RouteRenderResult> => {
    const startTime = performance.now();
    const url = interpolateRoutePath(route.path, route.params);
    const publicUrl = addRouteBasePath(url, route.basePath ?? '');
    const requestUrl = new URL(url, 'http://localhost');
    const resolvedData = resolveSsgRouteData(dataMap, route.path, url);
    const baseData = resolvedData.hasData ? resolvedData.data : undefined;
    const resourceCount =
      resolvedData.hasData && baseData ? Object.keys(baseData).length : 0;

    const mergedHandler: RouteHandler = route.handler;

    let phase: 'load' | 'render' = route.loader ? 'load' : 'render';
    try {
      await _preloadRouteHandler(mergedHandler);

      let routeData: unknown;
      let routeHydration:
        | ReturnType<typeof prepareRouteHydrationData>
        | undefined;
      let hasRouteData = false;
      if (route.loader) {
        const controller = new AbortController();
        const loadContext: RouteContext = {
          mode: 'ssg',
          params: route.params ?? {},
          pathname: requestUrl.pathname,
          search: requestUrl.search,
          hash: requestUrl.hash,
          href: `${requestUrl.pathname}${requestUrl.search}${requestUrl.hash}`,
          auth: {
            authenticated: false,
            principal: null,
            session: null,
            tenant: null,
          },
          signal: controller.signal,
        };
        const request = new Request(requestUrl);
        const loaded = await route.loader({
          ...loadContext,
          request,
        });
        await resolveDeferredValues(loaded, controller.signal);
        routeData = loaded;
        routeHydration = prepareRouteHydrationData(
          loaded,
          route.dehydrate,
          { ...loadContext, request },
          url
        );
        hasRouteData = true;
      }

      const renderedHandler = hasRouteData
        ? bindResolvedRouteData(mergedHandler, routeData, routeHydration)
        : mergedHandler;
      const registry =
        hasRouteData || !sharedRegistry
          ? createRouteRegistry(
              () => {
                defineRoute(route.path, renderedHandler, {
                  namespace: route.namespace,
                });
              },
              { basePath: route.basePath }
            )
          : sharedRegistry;

      phase = 'render';
      const html = renderToString({
        url: publicUrl,
        registry,
        seed,
        data: baseData,
        styleRegistrationValidation: 'off',
        document:
          document === undefined
            ? undefined
            : ({ appHtml, context }) =>
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
                      cspNonce: context.cspNonce,
                      styles: context.styles,
                    },
                  },
                  'createStaticGen()',
                  styleRegistrationValidation
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
        errorCause: error,
        errorContext: { route: url, phase },
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
