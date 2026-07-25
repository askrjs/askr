import type {
  ResolvedRoute,
  RouteAuthOptions,
  RouteHandler,
  RouteRequestResult,
  RouteRegistry,
} from '../common/router';
import { resolveRouteRequest } from '../router/route';
import { reconcileRouteMeta, resolveRouteMeta } from '../router/metadata';
import { getRouteRenderContext } from '../router/resolution';
import type { ComponentFunction } from '../runtime';

const MAX_INITIAL_ROUTE_REDIRECTS = 20;

export function bindResolvedRouteHandler(
  resolved: ResolvedRoute
): ComponentFunction {
  return () =>
    resolved.handler(resolved.params) as ReturnType<ComponentFunction>;
}

function createDeniedStatusNode(status: number) {
  return {
    type: 'div',
    props: {
      'data-route-denied': String(status),
    },
    children: [String(status)],
  };
}

export function bindDeniedStatus(status: number): ComponentFunction {
  return () => createDeniedStatusNode(status);
}

export function bindDeniedRouteHandler(status: number): RouteHandler {
  return () => createDeniedStatusNode(status);
}

export async function reconcileInitialRouteMetadata(
  resolved: RouteRequestResult
): Promise<void> {
  if (resolved?.kind !== 'render' || !resolved.record) return;
  if (
    !resolved.record.options.title &&
    !resolved.record.options.meta &&
    !resolved.record.metaChain?.length
  )
    return;
  const context = getRouteRenderContext(resolved);
  if (!context) return;
  reconcileRouteMeta(await resolveRouteMeta(resolved.record, context));
}

export async function resolveInitialRoute(
  auth?: RouteAuthOptions,
  source?: { registry: RouteRegistry; load?: boolean }
): Promise<{ path: string; href: string; resolved: RouteRequestResult }> {
  let path = typeof window !== 'undefined' ? window.location.pathname : '/';
  let href =
    typeof window !== 'undefined'
      ? `${window.location.pathname}${window.location.search}${window.location.hash}`
      : path;
  const visited = new Set<string>();

  for (
    let redirects = 0;
    redirects <= MAX_INITIAL_ROUTE_REDIRECTS;
    redirects++
  ) {
    if (visited.has(href)) {
      throw new Error(`[Askr] Route redirect cycle detected at ${href}.`);
    }
    visited.add(href);

    if (!source?.registry) {
      throw new TypeError('resolveInitialRoute requires a route registry.');
    }
    const resolved = await resolveRouteRequest(href, {
      registry: source.registry,
      auth,
      load: source.load,
    });
    if (
      typeof window === 'undefined' ||
      !resolved ||
      resolved.kind !== 'redirect'
    ) {
      return { path, href, resolved };
    }

    const redirectTarget = new URL(resolved.to, window.location.href);
    const redirectHref = `${redirectTarget.pathname}${redirectTarget.search}${redirectTarget.hash}`;
    window.history.replaceState({ path: redirectHref }, '', redirectHref);
    path = redirectTarget.pathname;
    href = redirectHref;
  }

  throw new Error(
    `[Askr] Route redirect limit exceeded (${MAX_INITIAL_ROUTE_REDIRECTS}).`
  );
}
