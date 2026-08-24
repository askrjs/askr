import { isPromiseLike } from '../common/promise';
import type {
  AccessDenyStatus,
  RouteManifest,
  RouteRequestResult,
} from '../common/router';
import * as RouteModule from '../router/route';
import { getRouteRenderContext } from '../router/resolution';
import type { AuthContext } from '@askrjs/auth';
import { _resolveRouteMatchFromRoutes } from '../router/route-matching';
import { throwSSRDataMissing } from './context';
import type { RouteRenderOptions, SSRRoute } from './route-render';
import {
  normalizeRouteBasePath,
  removeRouteBasePath,
} from '../router/base-path';

const MAX_SSR_REDIRECTS = 20;

type ResolvedPolicyAwareSSRRoute = {
  url: string;
  route: SSRRoute;
  params: Record<string, string>;
  authContext?: AuthContext;
};

function getRouteRequestResultSync(
  result: RouteRequestResult | Promise<RouteRequestResult>
): RouteRequestResult {
  if (isPromiseLike(result)) {
    throwSSRDataMissing();
  }

  return result;
}

function buildDeniedRoute(route: SSRRoute, status: AccessDenyStatus): SSRRoute {
  return {
    ...route,
    handler: () => ({
      type: 'div',
      props: {
        'data-route-denied': String(status),
      },
      children: [String(status)],
    }),
  };
}

function routeHasSSRLoader(manifest: RouteManifest, route: SSRRoute): boolean {
  const routeFallbackPrefix = (route as { fallbackPrefix?: string })
    .fallbackPrefix;

  return manifest.records.some((record) => {
    const recordFallbackPrefix = (record as { fallbackPrefix?: string })
      .fallbackPrefix;

    return (
      record.path === route.path &&
      recordFallbackPrefix === routeFallbackPrefix &&
      typeof record.options?.loader === 'function'
    );
  });
}

export function resolvePolicyAwareSSRRoute(
  opts: RouteRenderOptions,
  routeTable: SSRRoute[]
): ResolvedPolicyAwareSSRRoute {
  const manifest = opts.registry.manifest;

  let href = opts.url;
  const visited = new Set<string>();

  for (let redirects = 0; redirects <= MAX_SSR_REDIRECTS; redirects += 1) {
    const logicalHref = removeRouteBasePath(
      href,
      normalizeRouteBasePath(manifest.basePath)
    );
    if (logicalHref === undefined) {
      throw new Error(`SSR: no route found for url: ${href}`);
    }
    const logicalUrl = new URL(logicalHref, 'http://localhost');
    const matched = _resolveRouteMatchFromRoutes(
      logicalUrl.pathname,
      routeTable
    );

    if (!matched) {
      throw new Error(`SSR: no route found for url: ${href}`);
    }

    const resolved = getRouteRequestResultSync(
      RouteModule.resolveRouteRequest(href, {
        registry: opts.registry,
        mode: 'ssr',
        auth: opts.auth,
        authContext: opts.authContext,
        request: opts.request,
        signal: opts.signal,
      })
    );

    if (resolved === null) {
      throw new Error(`SSR: no route found for url: ${href}`);
    }

    if (resolved.kind === 'redirect') {
      const redirectTarget = new URL(resolved.to, 'http://localhost');
      const redirectHref = `${redirectTarget.pathname}${redirectTarget.search}${redirectTarget.hash}`;

      if (redirectHref === href || visited.has(redirectHref)) {
        throw new Error(
          `[Askr] SSR redirect cycle detected at ${redirectHref}.`
        );
      }

      if (redirects >= MAX_SSR_REDIRECTS) {
        throw new Error(
          `[Askr] SSR redirect limit exceeded (${MAX_SSR_REDIRECTS}).`
        );
      }

      visited.add(redirectHref);
      href = redirectHref;
      continue;
    }

    if (resolved.kind === 'deny') {
      return {
        url: href,
        route: buildDeniedRoute(matched.route, resolved.status),
        params: matched.params,
      };
    }

    return {
      url: href,
      route: {
        ...matched.route,
        handler: routeHasSSRLoader(manifest, matched.route)
          ? resolved.handler
          : matched.route.handler,
      },
      params: matched.params,
      authContext: getRouteRenderContext(resolved)?.auth,
    };
  }

  throw new Error(`[Askr] SSR redirect limit exceeded (${MAX_SSR_REDIRECTS}).`);
}
