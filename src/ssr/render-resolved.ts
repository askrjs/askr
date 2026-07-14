import type { RouteHandler } from '../common/router';
import type { DataRuntime } from '../data/types';
import * as RouteModule from '../router/route';
import type { SSRData } from './context';
import { renderToString, type SSRRoute } from './index';

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
  routes: ReadonlyArray<{
    path: string;
    handler: RouteHandler;
    namespace?: string;
  }>;
  handler: RouteHandler;
  params?: Record<string, string>;
  options?: { seed?: number; data?: SSRData; dataRuntime?: DataRuntime };
}): string {
  const { url, routes, handler, params, options } = opts;
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

  return renderToString({
    url,
    routes: effectiveRoutes as SSRRoute[],
    seed: options?.seed,
    data: options?.data,
    dataRuntime: options?.dataRuntime,
  });
}
