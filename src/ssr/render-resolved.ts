import type { RouteHandler, RouteRegistry } from '../common/router';
import type { DataRuntime } from '../data/types';
import { resolveRouteFromRoutes } from '../router/route-matching';
import type { SSRData } from './context';
import { renderToString } from './index';
import type { PageRenderEnvelope } from '../common/page-render-envelope';
import {
  normalizeRouteBasePath,
  removeRouteBasePath,
} from '../router/base-path';

function sameRouteParams(
  left: Record<string, string> | undefined,
  right: Record<string, string> | undefined
): boolean {
  if (!left || !right) {
    return !left && !right;
  }

  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  if (leftKeys.length !== rightKeys.length) {
    return false;
  }

  for (const key of leftKeys) {
    if (left[key] !== right[key]) {
      return false;
    }
  }

  return true;
}

export function renderResolvedToStringSync(opts: {
  url: string;
  registry: RouteRegistry;
  handler: RouteHandler;
  params?: Record<string, string>;
  options?: {
    seed?: number;
    data?: SSRData;
    dataRuntime?: DataRuntime;
    envelope?: PageRenderEnvelope;
    cspNonce?: string;
  };
}): string {
  const { url, registry, handler, params, options } = opts;
  const routes = registry.routes;
  const requestUrl = new URL(url, 'http://localhost');
  const logicalTarget = removeRouteBasePath(
    `${requestUrl.pathname}${requestUrl.search}${requestUrl.hash}`,
    normalizeRouteBasePath(registry.manifest.basePath)
  );

  const matchedIndex = routes.findIndex((route) => {
    if (logicalTarget === undefined) return false;
    const resolved = resolveRouteFromRoutes(
      new URL(logicalTarget, 'http://localhost').pathname,
      [route]
    );

    return (
      resolved !== null &&
      resolved.handler === route.handler &&
      sameRouteParams(resolved.params, params)
    );
  });

  if (matchedIndex < 0) {
    throw new Error(
      `renderResolvedToStringSync: no route found for url: ${url}`
    );
  }

  const effectiveRoutes = routes.map((route, index) =>
    index === matchedIndex ? { ...route, handler } : route
  );
  const matchedRoute = routes[matchedIndex]!;
  const effectiveRecords = registry.manifest.records.map((record) => {
    const isMatchedRecord =
      record.path === matchedRoute.path &&
      record.handler === matchedRoute.handler &&
      record.options.namespace === matchedRoute.namespace;
    const effectiveHandler = isMatchedRecord ? handler : record.handler;

    return {
      ...record,
      component: effectiveHandler,
      handler: effectiveHandler,
      layoutChain: [],
      pageChain: [],
      options: record.options.namespace
        ? { namespace: record.options.namespace }
        : {},
      metaChain: undefined,
    };
  });
  const effectiveRegistry = {
    manifest: {
      records: effectiveRecords,
      ...(registry.manifest.basePath
        ? { basePath: registry.manifest.basePath }
        : {}),
    },
    routes: effectiveRoutes,
  } as unknown as RouteRegistry;

  return renderToString({
    url,
    registry: effectiveRegistry,
    seed: options?.seed,
    data: options?.data,
    dataRuntime: options?.dataRuntime,
    envelope: options?.envelope,
    cspNonce: options?.cspNonce,
  });
}
