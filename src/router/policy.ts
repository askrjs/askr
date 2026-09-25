import type {
  AccessDecision,
  AccessAllowDecision,
  AccessDenyDecision,
  AccessDenyStatus,
  AccessRedirectDecision,
  AccessRedirectStatus,
  RouteContext,
  RouteDestination,
  RoutePolicy,
} from '../common/router';
import { addLogicalRouteBasePath } from './base-path';

/** Redirects whose `to` is already a public href from `to()`. */
const publicRedirects = new WeakSet<AccessRedirectDecision>();

/** Build a redirect decision; a typed destination's href is kept public. */
export function redirectDecision(
  to: string | RouteDestination,
  init: { status?: AccessRedirectStatus; replace?: boolean } = {},
  mapHref: (href: string) => string = (href) => href
): AccessRedirectDecision {
  const decision: AccessRedirectDecision = {
    kind: 'redirect',
    to: mapHref(typeof to === 'string' ? to : to.href),
    ...(init.status ? { status: init.status } : {}),
    ...(init.replace !== undefined ? { replace: init.replace } : {}),
  };
  if (typeof to !== 'string') publicRedirects.add(decision);
  return decision;
}

/**
 * Expose a redirect with a public target: a logical string gains the registry
 * `basePath`, while a typed destination is already public.
 */
export function exposeRedirectDecision(
  decision: AccessRedirectDecision,
  basePath: string
): AccessRedirectDecision {
  if (publicRedirects.has(decision)) return decision;
  return { ...decision, to: addLogicalRouteBasePath(decision.to, basePath) };
}

/** Policy decision: allow the route to render. */
export function allow(): AccessAllowDecision {
  return { kind: 'allow' };
}

/**
 * Policy decision: redirect the visitor to `to`. A string is a logical path
 * that gains the registry `basePath`; a `to()` destination is used as-is.
 */
export function redirect(
  to: string | RouteDestination,
  init: { status?: AccessRedirectStatus; replace?: boolean } = {}
): AccessRedirectDecision {
  return redirectDecision(to, init);
}

/** Policy decision: deny the request with the given HTTP status. */
export function deny(status: AccessDenyStatus): AccessDenyDecision {
  return { kind: 'deny', status };
}

/** Policy decision: deny with 401 Unauthorized. */
export function unauthorized(): AccessDenyDecision {
  return deny(401);
}

/** Policy decision: deny with 403 Forbidden. */
export function forbidden(): AccessDenyDecision {
  return deny(403);
}

/** Policy decision: deny with 404 Not Found. */
export function notFound(): AccessDenyDecision {
  return deny(404);
}

export function normalizeAccessDecision(
  result: AccessDecision
): AccessDecision {
  return result;
}

export async function evaluateRoutePolicy(
  policy: RoutePolicy,
  context: RouteContext
): Promise<AccessDecision> {
  return policy(context);
}
