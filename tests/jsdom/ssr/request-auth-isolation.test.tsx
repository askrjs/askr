import { afterEach, describe, expect, it } from 'vite-plus/test';
import type { AuthContext } from '@askrjs/auth';
import {
  createRouteRegistry,
  currentAuth,
  resolveRouteRequest,
  route,
} from '../../../src/router/route';
import {
  renderResolvedToStringSync,
  renderRouteRequestToString,
  renderToString,
} from '../../../src/ssr';
import { resetRouteState } from '../../router-test-utils';

function userAuth(id: string): AuthContext {
  return {
    authenticated: true,
    principal: { id },
    session: null,
    tenant: null,
  };
}

function Identity() {
  return <div>{currentAuth().principal?.id ?? 'anonymous'}</div>;
}

function createAccountRegistry(
  resolve: (id: string) => AuthContext | Promise<AuthContext>
) {
  return createRouteRegistry(
    () => {
      route('/account/{id}', Identity);
      route('/public', Identity);
    },
    {
      auth: {
        resolve: ({ params }) =>
          params.id ? resolve(params.id) : userAuth('unexpected'),
      },
    }
  );
}

describe('request-local auth isolation during SSR', () => {
  afterEach(() => {
    resetRouteState();
  });

  it('should not leak a server-resolved identity into a component-only render', async () => {
    const registry = createAccountRegistry(userAuth);
    await resolveRouteRequest('/account/alice', { registry, mode: 'ssr' });

    expect(renderToString(Identity)).toBe('<div>anonymous</div>');
  });

  it('should not leak a server-resolved identity into a resolved-route render', async () => {
    const registry = createAccountRegistry(userAuth);
    await resolveRouteRequest('/account/alice', { registry, mode: 'ssr' });

    const html = renderResolvedToStringSync({
      url: '/public',
      registry,
      handler: Identity,
      params: {},
    });

    expect(html).toBe('<div>anonymous</div>');
  });

  it('should not leak a previous request identity into a route render without auth', async () => {
    const registry = createAccountRegistry(userAuth);
    const alice = await renderRouteRequestToString({
      url: '/account/alice',
      registry,
    });
    expect(alice).toMatchObject({ kind: 'render', html: '<div>alice</div>' });

    expect(currentAuth().authenticated).toBe(false);
    expect(renderToString(Identity)).toBe('<div>anonymous</div>');
  });

  it('should keep interleaved concurrent requests on their own identity', async () => {
    const releases = new Map<string, () => void>();
    const registry = createAccountRegistry(
      (id) =>
        new Promise<AuthContext>((resolve) => {
          releases.set(id, () => resolve(userAuth(id)));
        })
    );

    const alice = renderRouteRequestToString({
      url: '/account/alice',
      registry,
    });
    const bob = renderRouteRequestToString({ url: '/account/bob', registry });
    await Promise.resolve();
    releases.get('bob')!();
    releases.get('alice')!();

    await expect(alice).resolves.toMatchObject({
      html: '<div>alice</div>',
    });
    await expect(bob).resolves.toMatchObject({ html: '<div>bob</div>' });
    expect(renderToString(Identity)).toBe('<div>anonymous</div>');
  });

  it('should still publish the resolved identity for browser navigation', async () => {
    const registry = createAccountRegistry(userAuth);
    await resolveRouteRequest('/account/alice', { registry, mode: 'spa' });

    expect(currentAuth().principal?.id).toBe('alice');
  });
});
