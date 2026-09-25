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
import { resolveNavigationUrl } from '../common/url';
import { addLogicalRouteBasePath } from './base-path';

/**
 * Records the public href of a redirect built from `to()`. It is an own
 * enumerable symbol, so `{ ...redirect(to(route)), status: 303 }` keeps it;
 * it only applies while `to` still equals that href.
 */
const PUBLIC_REDIRECT_HREF = Symbol('askr.publicRedirectHref');

type MarkedRedirectDecision = AccessRedirectDecision & {
  [PUBLIC_REDIRECT_HREF]?: string;
};

/**
 * Validate a non-allow access decision before it leaves route resolution: a
 * redirect to a path-like target that resolves to another origin throws.
 */
export function checkAccessDecision<T extends AccessDecision>(decision: T): T {
  if (decision.kind === 'redirect') resolveNavigationUrl(decision.to);
  return decision;
}

/** Build a redirect decision; a typed destination's href is kept public. */
export function redirectDecision(
  to: string | RouteDestination,
  init: { status?: AccessRedirectStatus; replace?: boolean } = {},
  mapHref: (href: string) => string = (href) => href
): AccessRedirectDecision {
  const decision: MarkedRedirectDecision = {
    kind: 'redirect',
    to: mapHref(typeof to === 'string' ? to : to.href),
    ...(init.status ? { status: init.status } : {}),
    ...(init.replace !== undefined ? { replace: init.replace } : {}),
  };
  if (typeof to !== 'string') decision[PUBLIC_REDIRECT_HREF] = decision.to;
  return checkAccessDecision(decision);
}

/**
 * Expose a redirect with a public target: a logical string gains the registry
 * `basePath`, while a typed destination is already public.
 */
export function exposeRedirectDecision(
  decision: AccessRedirectDecision,
  basePath: string
): AccessRedirectDecision {
  const publicHref = (decision as MarkedRedirectDecision)[PUBLIC_REDIRECT_HREF];
  if (publicHref !== undefined && publicHref === decision.to) return decision;
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
