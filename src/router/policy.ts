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

export function allow(): AccessAllowDecision {
  return { kind: 'allow' };
}

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

export function deny(status: AccessDenyStatus): AccessDenyDecision {
  return { kind: 'deny', status };
}

export function unauthorized(): AccessDenyDecision {
  return deny(401);
}

export function forbidden(): AccessDenyDecision {
  return deny(403);
}

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
