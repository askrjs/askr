import type { RouteHandler, RouteRegistry } from '../common/router';
import type { DataRuntime } from '../data/types';
import * as RouteModule from '../router/route';
import { createRouteRegistry, route as defineRoute } from '../router/route';
import type { SSRData } from './context';
import { renderToString } from './index';
import type { PageRenderEnvelope } from '../common/page-render-envelope';

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

  const matchedIndex = routes.findIndex((route) => {
    const resolved = RouteModule.resolveRouteFromRoutes(requestUrl.pathname, [
      route,
    ]);

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
  const effectiveRegistry = createRouteRegistry(() => {
    for (const route of effectiveRoutes) {
      defineRoute(route.path, route.handler, { namespace: route.namespace });
    }
  });

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
