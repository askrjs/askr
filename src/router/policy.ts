import type {
  AccessDecision,
  AccessAllowDecision,
  AccessDenyDecision,
  AccessDenyStatus,
  AccessRedirectDecision,
  AccessRedirectStatus,
  RouteAuthOptions,
  RouteContext,
  RoutePolicy,
} from '../common/router';
import { isPromiseLike } from '../common/promise';

const ROUTE_AUTH_OPTIONS = Symbol.for('__ASKR_ROUTE_AUTH_OPTIONS__');

type InternalRouteContext = RouteContext & {
  [ROUTE_AUTH_OPTIONS]?: RouteAuthOptions;
};

type RoutePathResolver =
  | string
  | ((context: RouteContext) => string | PromiseLike<string>);

export function allow(): AccessAllowDecision {
  return { kind: 'allow' };
}

export function redirect(
  to: string,
  init: {
    status?: AccessRedirectStatus;
    replace?: boolean;
  } = {}
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

export function withRouteAuthOptions(
  context: RouteContext,
  auth: RouteAuthOptions | undefined
): RouteContext {
  const internal = context as InternalRouteContext;

  if (!auth) {
    delete internal[ROUTE_AUTH_OPTIONS];
    return context;
  }

  internal[ROUTE_AUTH_OPTIONS] = auth;
  return context;
}

function getRouteAuthOptions(
  context: RouteContext
): RouteAuthOptions | undefined {
  return (context as InternalRouteContext)[ROUTE_AUTH_OPTIONS];
}

function assertRouteAuthOptions(context: RouteContext): RouteAuthOptions {
  const auth = getRouteAuthOptions(context);
  if (!auth?.resolve) {
    throw new Error(
      'Built-in auth policies require router auth configuration. ' +
        'Provide `auth` to registerRoutes(...), createSPA(...), hydrateSPA(...), or SSR route resolution.'
    );
  }

  return auth;
}

function resolvePathSetting(
  value: RoutePathResolver | undefined,
  fallback: string,
  context: RouteContext
): string | PromiseLike<string> {
  if (!value) {
    return fallback;
  }

  if (typeof value === 'function') {
    return value(context);
  }

  return value;
}

function appendNextTarget(path: string, href: string): string {
  const resolved = new URL(path, 'http://localhost');
  resolved.searchParams.set('next', href);
  return `${resolved.pathname}${resolved.search}${resolved.hash}`;
}

function collectStringValues(value: unknown): string[] {
  if (typeof value === 'string') {
    return [value];
  }

  if (Array.isArray(value)) {
    return value.filter((entry): entry is string => typeof entry === 'string');
  }

  if (value instanceof Set) {
    return Array.from(value).filter(
      (entry): entry is string => typeof entry === 'string'
    );
  }

  return [];
}

function defaultHasRole(user: unknown, role: string): boolean {
  if (!user || typeof user !== 'object') {
    return false;
  }

  return collectStringValues((user as { roles?: unknown }).roles).includes(
    role
  );
}

function defaultHasPermission(user: unknown, permission: string): boolean {
  if (!user || typeof user !== 'object') {
    return false;
  }

  return collectStringValues(
    (user as { permissions?: unknown }).permissions
  ).includes(permission);
}

function resolveUnauthenticatedRedirect(
  context: RouteContext
): AccessDecision | Promise<AccessDecision> {
  const auth = assertRouteAuthOptions(context);
  const loginPath = resolvePathSetting(auth.loginPath, '/login', context);
  if (isPromiseLike<string>(loginPath)) {
    return Promise.resolve(loginPath).then((nextPath) =>
      redirect(appendNextTarget(nextPath, context.href), {
        replace: context.mode === 'spa',
      })
    );
  }

  return redirect(appendNextTarget(loginPath, context.href), {
    replace: context.mode === 'spa',
  });
}

function resolveAuthenticatedRedirect(
  context: RouteContext
): AccessDecision | Promise<AccessDecision> {
  const auth = assertRouteAuthOptions(context);
  const target = resolvePathSetting(auth.guestRedirectTo, '/', context);
  if (isPromiseLike<string>(target)) {
    return Promise.resolve(target).then((nextTarget) =>
      redirect(nextTarget, {
        replace: true,
      })
    );
  }

  return redirect(target, {
    replace: true,
  });
}

export function requireAuth(): RoutePolicy {
  return (context) => {
    if (context.session) {
      return allow();
    }

    return resolveUnauthenticatedRedirect(context);
  };
}

export function requireGuest(): RoutePolicy {
  return (context) => {
    if (!context.session) {
      return allow();
    }

    return resolveAuthenticatedRedirect(context);
  };
}

export function requireRole(role: string): RoutePolicy {
  return (context) => {
    if (!context.user) {
      return resolveUnauthenticatedRedirect(context);
    }

    const auth = assertRouteAuthOptions(context);
    const hasRole = auth.hasRole
      ? auth.hasRole(context.user, role, context)
      : defaultHasRole(context.user, role);

    if (isPromiseLike<boolean>(hasRole)) {
      return Promise.resolve(hasRole).then((next) =>
        next ? allow() : forbidden()
      );
    }

    return hasRole ? allow() : forbidden();
  };
}

export function requirePermission(permission: string): RoutePolicy {
  return (context) => {
    if (!context.user) {
      return resolveUnauthenticatedRedirect(context);
    }

    const auth = assertRouteAuthOptions(context);
    const hasPermission = auth.hasPermission
      ? auth.hasPermission(context.user, permission, context)
      : defaultHasPermission(context.user, permission);

    if (isPromiseLike<boolean>(hasPermission)) {
      return Promise.resolve(hasPermission).then((next) =>
        next ? allow() : forbidden()
      );
    }

    return hasPermission ? allow() : forbidden();
  };
}

export async function evaluateRoutePolicy(
  policy: RoutePolicy,
  context: RouteContext
): Promise<AccessDecision> {
  const result = await policy(context);
  return result;
}
