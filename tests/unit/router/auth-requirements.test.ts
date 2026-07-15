import { describe, expect, it } from 'vite-plus/test';
import {
  requireAnonymous,
  requireRole,
  requireUser,
  type AuthContext,
} from '@askrjs/auth';
import { createRouteRegistry, route } from '../../../src/router/route';
import { resolveRouteRequest } from '../../../src/router/resolution';

const anonymous: AuthContext = {
  authenticated: false,
  principal: null,
  session: null,
  tenant: null,
};

const user: AuthContext = {
  authenticated: true,
  principal: { id: 'user-1', roles: ['member'] },
  session: null,
  tenant: null,
};

describe('route auth requirements', () => {
  it('should expose AuthContext as the only route identity value', async () => {
    let policyContext: unknown;
    const registry = createRouteRegistry(() => {
      route('/account', () => 'account', {
        policies: [
          (context) => {
            policyContext = context;
            return { kind: 'allow' };
          },
        ],
      });
    });
    await resolveRouteRequest('/account', {
      manifest: registry.manifest,
      authContext: user,
    });
    expect((policyContext as { auth: AuthContext }).auth).toBe(user);
    expect(policyContext).not.toHaveProperty('session');
    expect(policyContext).not.toHaveProperty('user');
  });

  it('should use pre-resolved auth without invoking the configured resolver', async () => {
    let resolutions = 0;
    const registry = createRouteRegistry(
      () => route('/account', () => 'account', { auth: requireUser() }),
      { auth: { resolve: () => ((resolutions += 1), anonymous) } }
    );
    const result = await resolveRouteRequest('/account', {
      manifest: registry.manifest,
      authContext: user,
    });
    expect(result?.kind).toBe('render');
    expect(resolutions).toBe(0);
  });

  it('should evaluate the same AuthRequirement during SPA and SSR resolution', async () => {
    const requirement = requireRole('admin');
    const registry = createRouteRegistry(() => {
      route('/admin', () => 'admin', { auth: requirement });
    });
    await expect(
      Promise.resolve(
        resolveRouteRequest('/admin', {
          manifest: registry.manifest,
          mode: 'spa',
          authContext: user,
        })
      )
    ).resolves.toEqual({ kind: 'deny', status: 403 });
    await expect(
      Promise.resolve(
        resolveRouteRequest('/admin', {
          manifest: registry.manifest,
          mode: 'ssr',
          authContext: user,
        })
      )
    ).resolves.toEqual({ kind: 'deny', status: 403 });
  });

  it('should redirect unauthenticated navigation with the original target', async () => {
    const registry = createRouteRegistry(
      () => route('/account', () => 'account', { auth: requireUser() }),
      { auth: { resolve: () => anonymous, loginPath: '/sign-in' } }
    );
    await expect(
      Promise.resolve(
        resolveRouteRequest('/account?tab=billing', {
          manifest: registry.manifest,
          mode: 'spa',
        })
      )
    ).resolves.toEqual({
      kind: 'redirect',
      to: '/sign-in?next=%2Faccount%3Ftab%3Dbilling',
      replace: true,
    });
  });

  it('should redirect an already authenticated user away from an anonymous route', async () => {
    const registry = createRouteRegistry(
      () => route('/sign-in', () => 'sign in', { auth: requireAnonymous() }),
      { auth: { resolve: () => user, authenticatedRedirectTo: '/account' } }
    );
    await expect(
      Promise.resolve(
        resolveRouteRequest('/sign-in', { manifest: registry.manifest })
      )
    ).resolves.toEqual({
      kind: 'redirect',
      to: '/account',
      replace: true,
    });
  });

  it('should return 403 for forbidden navigation', async () => {
    const registry = createRouteRegistry(() => {
      route('/admin', () => 'admin', { auth: requireRole('admin') });
    });
    await expect(
      Promise.resolve(
        resolveRouteRequest('/admin', {
          manifest: registry.manifest,
          authContext: user,
        })
      )
    ).resolves.toEqual({ kind: 'deny', status: 403 });
  });

  it('should decide authorization before loader preload and query execution', async () => {
    const calls: string[] = [];
    const registry = createRouteRegistry(() => {
      route('/admin', () => 'admin', {
        auth: () => (
          calls.push('auth'),
          { allowed: false, reason: 'forbidden' }
        ),
        preload: () => calls.push('preload'),
        loader: () => calls.push('loader'),
      });
    });
    await resolveRouteRequest('/admin', {
      manifest: registry.manifest,
      authContext: user,
    });
    expect(calls).toEqual(['auth']);
  });

  it('should run loaders for client navigation and skip them during hydration adoption', async () => {
    let loads = 0;
    const registry = createRouteRegistry(() => {
      route('/deferred', () => 'deferred', {
        loader: () => ({ value: ++loads }),
      });
    });

    await resolveRouteRequest('/deferred', {
      manifest: registry.manifest,
      mode: 'spa',
    });
    await resolveRouteRequest('/deferred', {
      manifest: registry.manifest,
      mode: 'spa',
      load: false,
    });

    expect(loads).toBe(1);
  });
});
