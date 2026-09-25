import { isPromiseLike } from '../common/promise';
import type { RouteRequestResult } from '../common/router';
import * as RouteModule from '../router/route';
import { getRouteRenderContext } from '../router/resolution';
import type { AuthContext } from '@askrjs/auth';
import { getMatchingRouteRecord } from '../router/route-matching';
import { SSRAccessDecisionError, SSRDataMissingError } from './errors';
import type { RouteRenderOptions, SSRRoute } from './route-render';
import {
  normalizeRouteBasePath,
  removeRouteBasePath,
} from '../router/base-path';

type ResolvedPolicyAwareSSRRoute = {
  route: SSRRoute;
  params: Record<string, string>;
  authContext?: AuthContext;
};

function getRouteRequestResultSync(
  result: RouteRequestResult | Promise<RouteRequestResult>,
  href: string
): RouteRequestResult {
  if (isPromiseLike(result)) {
    // Sync SSR abandons this resolution; observe its outcome so a rejection
    // does not surface as an unhandled rejection.
    void Promise.resolve(result).catch(() => undefined);
    throw new SSRDataMissingError(
      `SSR: route resolution for ${href} is asynchronous (async auth, policy, lazy route, or preload). renderToString()/renderToStream() only resolve routes synchronously; use renderRouteRequest() to await route resolution.`
    );
  }

  return result;
}

export function resolvePolicyAwareSSRRoute(
  opts: RouteRenderOptions,
  routeTable: SSRRoute[]
): ResolvedPolicyAwareSSRRoute {
  const href = opts.url;
  const logicalHref = removeRouteBasePath(
    href,
    normalizeRouteBasePath(opts.registry.manifest.basePath)
  );
  if (logicalHref === undefined) {
    throw new Error(`SSR: no route found for url: ${href}`);
  }
  // Match against manifest records, the same matcher resolveRouteRequest()
  // and async SSR (renderRouteRequest) use, so sync and async SSR always pick
  // the same route.
  const matched = getMatchingRouteRecord(
    logicalHref,
    opts.registry.manifest.records
  );
  // The registry's route table carries the same handlers as its records.
  const route =
    matched &&
    routeTable.find((entry) => entry.handler === matched.record.handler);

  if (!matched || !route) {
    throw new Error(`SSR: no route found for url: ${href}`);
  }

  // Reject loader routes before resolution starts, so neither the loader nor
  // its preload or lazy import is started for a render that cannot use them.
  const { record } = matched;
  if (typeof record.options.loader === 'function') {
    throw new SSRDataMissingError(
      `SSR: route ${record.path} declares a loader, which renderToString()/renderToStream() do not run. Use renderRouteRequest() to await route loaders before rendering.`
    );
  }

  const resolved = getRouteRequestResultSync(
    RouteModule.resolveRouteRequest(href, {
      registry: opts.registry,
      mode: 'ssr',
      auth: opts.auth,
      authContext: opts.authContext,
      request: opts.request,
      signal: opts.signal,
      load: false,
    }),
    href
  );

  if (resolved === null) {
    throw new Error(`SSR: no route found for url: ${href}`);
  }

  if (resolved.kind === 'redirect' || resolved.kind === 'deny') {
    throw new SSRAccessDecisionError(resolved);
  }

  return {
    route,
    params: matched.params,
    authContext: getRouteRenderContext(resolved)?.auth,
  };
}
