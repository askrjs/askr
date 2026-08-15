import type {
  AccessDecision,
  AccessAllowDecision,
  AccessDenyDecision,
  AccessDenyStatus,
  AccessRedirectDecision,
  AccessRedirectStatus,
  RouteContext,
  RoutePolicy,
} from '../common/router';

/** Policy decision: allow the route to render. */
export function allow(): AccessAllowDecision {
  return { kind: 'allow' };
}

/** Policy decision: redirect the visitor to `to`. */
export function redirect(
  to: string,
  init: { status?: AccessRedirectStatus; replace?: boolean } = {}
): AccessRedirectDecision {
  return {
    kind: 'redirect',
    to,
    ...(init.status ? { status: init.status } : {}),
    ...(init.replace !== undefined ? { replace: init.replace } : {}),
  };
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
