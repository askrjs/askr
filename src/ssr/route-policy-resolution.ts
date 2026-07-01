import { isPromiseLike } from '../common/promise';
import type {
  AccessDenyStatus,
  RouteManifest,
  RouteRequestResult,
} from '../common/router';
import * as RouteModule from '../router/route';
import { throwSSRDataMissing } from './context';
import type { RouteRenderOptions, SSRRoute } from './route-render';

const MAX_SSR_REDIRECTS = 20;

type ResolvedPolicyAwareSSRRoute = {
  url: string;
  route: SSRRoute;
  params: Record<string, string>;
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
  const manifest = opts.registry?.manifest;

  if (!manifest) {
    const requestUrl = new URL(opts.url, 'http://localhost');
    const matched = RouteModule._resolveRouteMatchFromRoutes(
      requestUrl.pathname,
      routeTable
    );
    if (!matched) {
      throw new Error(`SSR: no route found for url: ${opts.url}`);
    }

    return {
      url: opts.url,
      route: matched.route,
      params: matched.params,
    };
  }

  let href = opts.url;
  const visited = new Set<string>();

  for (let redirects = 0; redirects <= MAX_SSR_REDIRECTS; redirects += 1) {
    const requestUrl = new URL(href, 'http://localhost');
    const matched = RouteModule._resolveRouteMatchFromRoutes(
      requestUrl.pathname,
      routeTable
    );

    if (!matched) {
      throw new Error(`SSR: no route found for url: ${href}`);
    }

    const resolved = getRouteRequestResultSync(
      RouteModule.resolveRouteRequest(href, {
        manifest,
        mode: 'ssr',
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
    };
  }

  throw new Error(`[Askr] SSR redirect limit exceeded (${MAX_SSR_REDIRECTS}).`);
}
