import { describe, expect, it } from 'vite-plus/test';
import type {
  RouteAuthOptions,
  RouteContext,
} from '../../../src/common/router';
import {
  allow,
  deny,
  evaluateRoutePolicy,
  forbidden,
  notFound,
  redirect,
  requireAuth,
  requireGuest,
  requirePermission,
  requireRole,
  unauthorized,
  withRouteAuthOptions,
} from '../../../src/router/policy';

type TestUser = {
  roles?: string[] | Set<string>;
  permissions?: string[] | Set<string>;
};

function createContext(
  overrides: Partial<RouteContext<unknown, TestUser>> = {},
  auth?: RouteAuthOptions
): RouteContext<unknown, TestUser> {
  const context: RouteContext<unknown, TestUser> = {
    mode: 'spa',
    params: {},
    pathname: '/private',
    search: '',
    hash: '',
    href: '/private',
    session: null,
    user: null,
    signal: new AbortController().signal,
    ...overrides,
  };

  return withRouteAuthOptions(context, auth) as RouteContext<unknown, TestUser>;
}

describe('router access policy helpers', () => {
  it('should create primitive access decisions', () => {
    expect(allow()).toEqual({ kind: 'allow' });
    expect(redirect('/login')).toEqual({ kind: 'redirect', to: '/login' });
    expect(redirect('/login', { status: 303, replace: true })).toEqual({
      kind: 'redirect',
      to: '/login',
      status: 303,
      replace: true,
    });
    expect(deny(403)).toEqual({ kind: 'deny', status: 403 });
    expect(unauthorized()).toEqual({ kind: 'deny', status: 401 });
    expect(forbidden()).toEqual({ kind: 'deny', status: 403 });
    expect(notFound()).toEqual({ kind: 'deny', status: 404 });
  });

  it('should require auth configuration before redirecting anonymous users', () => {
    expect(() => requireAuth()(createContext())).toThrow(/auth configuration/i);
  });

  it('should redirect anonymous users to login with next target', async () => {
    const auth: RouteAuthOptions = {
      resolve: () => ({ session: null, user: null }),
      loginPath: ({ search }) => `/login${search}`,
    };

    await expect(
      evaluateRoutePolicy(
        requireAuth(),
        createContext(
          { search: '?tab=billing', href: '/private?tab=billing' },
          auth
        )
      )
    ).resolves.toEqual({
      kind: 'redirect',
      to: '/login?tab=billing&next=%2Fprivate%3Ftab%3Dbilling',
      replace: true,
    });
  });

  it('should allow authenticated users through requireAuth', async () => {
    await expect(
      evaluateRoutePolicy(
        requireAuth(),
        createContext({ session: { id: 's1' }, user: { roles: ['user'] } })
      )
    ).resolves.toEqual({ kind: 'allow' });
  });

  it('should redirect authenticated users away from guest routes', async () => {
    const auth: RouteAuthOptions = {
      resolve: () => ({ session: { id: 's1' }, user: null }),
      guestRedirectTo: async ({ hash }) => `/dashboard${hash}`,
    };

    await expect(
      evaluateRoutePolicy(
        requireGuest(),
        createContext({ session: { id: 's1' }, hash: '#top' }, auth)
      )
    ).resolves.toEqual({
      kind: 'redirect',
      to: '/dashboard#top',
      replace: true,
    });
  });

  it('should evaluate default role and permission collections', async () => {
    const user: TestUser = {
      roles: new Set(['admin']),
      permissions: ['settings:write'],
    };
    const auth: RouteAuthOptions = {
      resolve: () => ({ session: { id: 's1' }, user }),
    };

    await expect(
      evaluateRoutePolicy(requireRole('admin'), createContext({ user }, auth))
    ).resolves.toEqual({ kind: 'allow' });
    await expect(
      evaluateRoutePolicy(
        requirePermission('settings:write'),
        createContext({ user }, auth)
      )
    ).resolves.toEqual({ kind: 'allow' });
    await expect(
      evaluateRoutePolicy(requireRole('owner'), createContext({ user }, auth))
    ).resolves.toEqual({ kind: 'deny', status: 403 });
  });

  it('should support custom async role and permission resolvers', async () => {
    const user: TestUser = { roles: [], permissions: [] };
    const auth: RouteAuthOptions<unknown, TestUser> = {
      resolve: () => ({ session: { id: 's1' }, user }),
      hasRole: async (_user, role) => role === 'editor',
      hasPermission: async (_user, permission) =>
        permission === 'posts:publish',
    };

    await expect(
      evaluateRoutePolicy(requireRole('editor'), createContext({ user }, auth))
    ).resolves.toEqual({ kind: 'allow' });
    await expect(
      evaluateRoutePolicy(
        requirePermission('posts:publish'),
        createContext({ user }, auth)
      )
    ).resolves.toEqual({ kind: 'allow' });
  });
});
