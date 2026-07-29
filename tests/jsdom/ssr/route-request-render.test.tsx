import { describe, expect, it } from 'vite-plus/test';
import { requireUser, type AuthContext } from '@askrjs/auth';
import { createRouteRegistry, route } from '../../../src/router/route';
import { renderRouteRequestToString } from '../../../src/ssr';

const user: AuthContext = {
  authenticated: true,
  principal: { id: 'user-1' },
  session: null,
  tenant: null,
};

describe('single-pass route request rendering', () => {
  it('should render the resolved route without matching it again', async () => {
    let requirements = 0;
    let renders = 0;
    const registry = createRouteRegistry(() => {
      route(
        '/account/{id}',
        ({ id }) => {
          renders += 1;
          return <div>{id}</div>;
        },
        {
          auth: (context) => {
            requirements += 1;
            return requireUser()(context);
          },
        }
      );
    });
    const result = await renderRouteRequestToString({
      url: '/account/42',
      registry,
      authContext: user,
    });
    expect(result).toEqual({
      kind: 'render',
      html: '<div>42</div>',
      styles: [],
      params: { id: '42' },
    });
    expect(requirements).toBe(1);
    expect(renders).toBe(1);
  });

  it('should preserve AuthContext object identity through SSR route evaluation', async () => {
    let requirementAuth: AuthContext | undefined;
    let preloadAuth: AuthContext | undefined;
    const registry = createRouteRegistry(() => {
      route('/account', () => <div>{'account'}</div>, {
        auth: (context) => {
          requirementAuth = context;
          return { allowed: true };
        },
        preload: (context) => {
          preloadAuth = context.auth;
        },
      });
    });
    await renderRouteRequestToString({
      url: '/account',
      registry,
      authContext: user,
    });
    expect(requirementAuth).toBe(user);
    expect(preloadAuth).toBe(user);
  });

  it('should return redirect denial and no-match without rendering', async () => {
    const registry = createRouteRegistry(() => {
      route('/account', () => <div>{'account'}</div>, { auth: requireUser() });
    });
    const anonymous: AuthContext = {
      authenticated: false,
      principal: null,
      session: null,
      tenant: null,
    };
    await expect(
      renderRouteRequestToString({
        url: '/account',
        registry,
        authContext: anonymous,
      })
    ).resolves.toMatchObject({ kind: 'redirect' });
    await expect(
      renderRouteRequestToString({
        url: '/missing',
        registry,
        authContext: user,
      })
    ).resolves.toEqual({ kind: 'no-match' });
  });
});
