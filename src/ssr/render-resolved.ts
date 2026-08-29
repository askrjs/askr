import type { RouteHandler, RouteRegistry } from '../common/router';
import type { DataRuntime } from '../data/types';
import { resolveRouteFromRoutes } from '../router/route-matching';
import { createRenderContext, type SSRData } from './context';
import type { PageRenderEnvelope } from '../common/page-render-envelope';
import {
  normalizeRouteBasePath,
  removeRouteBasePath,
} from '../router/base-path';
import { validateCspNonce } from '../csp-nonce';
import { renderSSRRouteAppToSink } from './render-sync';
import { StringSink } from './sink';
import type { AuthContext } from '@askrjs/auth';

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

/** Synchronously render an already-resolved route handler to an HTML string. */
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
  return renderResolvedRouteToStringSync(opts);
}

function renderResolvedRouteToStringSync(
  opts: Parameters<typeof renderResolvedToStringSync>[0],
  authContext?: AuthContext
): string {
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
  const cspNonce = validateCspNonce(options?.cspNonce);
  const ctx = createRenderContext(options?.seed, {
    url,
    basePath: registry.manifest.basePath,
    data: options?.data,
    params,
    routes: effectiveRoutes,
    routeAuth: registry.manifest.auth,
    authContext,
    dataRuntime: options?.dataRuntime,
    envelope: options?.envelope,
    cspNonce,
  });
  const sink = new StringSink();
  renderSSRRouteAppToSink({
    route: { ...matchedRoute, handler },
    params: params ?? {},
    data: options?.data,
    ctx,
    sink,
  });
  sink.end();
  return sink.toString();
}

/** @internal Render the resolved hydration route with its request-local auth context. */
export function renderResolvedForHydrationSync(
  opts: Parameters<typeof renderResolvedToStringSync>[0],
  authContext: AuthContext
): string {
  return renderResolvedRouteToStringSync(opts, authContext);
}
