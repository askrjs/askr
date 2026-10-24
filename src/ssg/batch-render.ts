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
import { createDataRuntime } from '../data/data-runtime';
import { createQueryPrefetchContext } from '../data/query-registry';
import type { DataRuntime } from '../data/types';
import type { ServerQueryRegistry } from '../data/query-registry';
import { resolveRouteMeta } from '../router/metadata';
import {
  getOutputFilePath,
  interpolateRoutePath,
  interpolateRouteUrl,
  NOT_FOUND_FILE,
} from './route-utils';
import { resolveDeferredValues } from '../router/deferred';
import { bindResolvedRouteData } from '../router/resolution';
import { _preloadRouteHandler } from '../router/lazy';
import {
  prepareRouteHydrationData,
  validateRouteHydrationData,
} from '../router/route-hydration';
import type { InternalRouteRecord } from '../router/internal-types';
import { RouteDataLoadError } from '../router/route-data-loader';
import { emptyRouteSearch, parseRouteSearch } from '../router/route-search';
import { addRouteBasePath } from '../router/base-path';

interface BatchRenderOptions {
  seed?: number;
  dataMap?: Record<string, SSRData>;
  concurrency?: number;
  document?: DocumentRenderer;
  styleRegistrationValidation?: SSRStyleRegistrationValidation;
  queryRegistry?: ServerQueryRegistry;
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
    queryRegistry,
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
    const path = interpolateRoutePath(route.path, route.params);
    const url = interpolateRouteUrl(route.path, route.params);
    const publicUrl = addRouteBasePath(url, route.basePath ?? '');
    const requestUrl = new URL(url, 'http://localhost');
    const resolvedData = resolveSsgRouteData(dataMap, route.path, path);
    const baseData = resolvedData.hasData ? resolvedData.data : undefined;
    const resourceCount =
      resolvedData.hasData && baseData ? Object.keys(baseData).length : 0;

    const mergedHandler: RouteHandler = route.handler;

    const scopeLoaders =
      (route.record as InternalRouteRecord | undefined)?.loaderChain ?? [];
    let phase: 'load' | 'render' =
      route.loader || scopeLoaders.length > 0 ? 'load' : 'render';
    try {
      await _preloadRouteHandler(mergedHandler);

      let routeData: unknown;
      let routeHydration:
        | ReturnType<typeof prepareRouteHydrationData>
        | undefined;
      let hasRouteData = false;
      let layout:
        | {
            values: Map<unknown, unknown>;
            hydration: unknown[];
          }
        | undefined;
      if (route.loader || scopeLoaders.length > 0) {
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
          searchParams: route.search
            ? parseRouteSearch(route.search, requestUrl.search)
            : emptyRouteSearch(),
        };
        const request = new Request(requestUrl);
        const run = async (
          loader: (context: never) => unknown
        ): Promise<unknown> => {
          const loaded = await loader({
            ...loadContext,
            searchParams: loadContext.searchParams!,
            request,
          } as never);
          await resolveDeferredValues(loaded, controller.signal);
          return loaded;
        };
        // Group and page loaders (outermost first) and the leaf loader are
        // independent: start them together, as an SSR request does.
        const [scoped, loaded] = await Promise.all([
          Promise.all(scopeLoaders.map((scope) => run(scope.loader))),
          route.loader ? run(route.loader) : undefined,
        ]);
        if (scopeLoaders.length > 0) {
          layout = {
            values: new Map(
              scopeLoaders.map((scope, index) => [scope.loader, scoped[index]])
            ),
            hydration: scoped.map((value) => {
              validateRouteHydrationData(value, `${url} (layout)`);
              return value ?? null;
            }),
          };
        }
        if (route.loader) {
          routeData = loaded;
          routeHydration = prepareRouteHydrationData(
            loaded,
            route.dehydrate,
            { ...loadContext, request },
            url
          );
          hasRouteData = true;
        }
      }

      const requestContext: RouteContext = {
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
        signal: new AbortController().signal,
        searchParams: route.search
          ? parseRouteSearch(route.search, requestUrl.search)
          : emptyRouteSearch(),
      };
      // Query prefetches run against a page-local runtime whose cache the
      // page embeds, as an SSR request would.
      let dataRuntime: DataRuntime | undefined;
      if (route.preload) {
        dataRuntime = createDataRuntime();
        const request = new Request(requestUrl);
        await route.preload({
          ...requestContext,
          searchParams: requestContext.searchParams!,
          request,
          data: createQueryPrefetchContext({
            mode: 'ssr',
            request,
            signal: requestContext.signal,
            runtime: dataRuntime,
            registry: queryRegistry,
          }),
        });
      }
      const meta = route.record
        ? await resolveRouteMeta(route.record, requestContext)
        : undefined;

      const renderedHandler =
        hasRouteData || layout
          ? bindResolvedRouteData(
              mergedHandler,
              routeData,
              routeHydration,
              layout,
              hasRouteData
            )
          : mergedHandler;
      const registry =
        hasRouteData || layout || !sharedRegistry
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
        dataRuntime,
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
                      ...(meta ? { meta } : {}),
                    },
                  },
                  'createStaticGen()',
                  styleRegistrationValidation
                ),
      });

      const duration = performance.now() - startTime;
      return {
        path,
        filePath: route.notFound ? NOT_FOUND_FILE : getOutputFilePath(path),
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
        path,
        filePath: route.notFound ? NOT_FOUND_FILE : getOutputFilePath(path),
        html: '',
        fileSize: 0,
        renderDuration: Math.round(duration),
        resourceCount,
        status: 'error',
        reason: 'full',
        written: false,
        error: error instanceof Error ? error.message : String(error),
        errorCause:
          phase === 'load' && error instanceof RouteDataLoadError
            ? error.cause
            : error,
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
