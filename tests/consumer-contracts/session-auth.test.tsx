import { expect, test } from 'vite-plus/test';
import { cleanupApp, hydrateSPA } from '@askrjs/askr/boot';
import { createQuery, defineQuery, type Query } from '@askrjs/askr/data';
import {
  createRouteRegistry,
  createSessionAuth,
  currentAuth,
  navigate,
  route,
} from '@askrjs/askr/router';
import { renderRouteRequestToString } from '@askrjs/askr/ssr';
import { flush } from '@askrjs/askr/testing';

async function settle(): Promise<void> {
  for (let index = 0; index < 20; index++) {
    await Promise.resolve();
    flush();
  }
}

test('should bind packed SSR hydration, protected navigation and terminal private-data retirement without a browser SDK', async () => {
  const root = document.createElement('main');
  document.body.append(root);
  const previousUrl = location.href;
  history.replaceState({}, '', '/provider-private');
  let requests = 0;
  let releaseLogout!: (response: Response) => void;
  const pendingLogout = new Promise<Response>((resolve) => {
    releaseLogout = resolve;
  });
  const auth = createSessionAuth({
    fetch: async (input) => {
      requests++;
      if ((input as Request).method === 'POST') return pendingLogout;
      throw new Error('SSR adoption must not fetch a session');
    },
  });
  let privateHandle!: Query<string>;
  const privateQuery = defineQuery({
    key: () => 'provider:private',
    fetch: async () => 'private-data',
  });
  const registry = createRouteRegistry(
    () => {
      route(
        '/provider-private',
        () => {
          privateHandle = createQuery(privateQuery, {});
          return (
            <main>
              {currentAuth().principal?.id}:{privateHandle.data}
            </main>
          );
        },
        {
          policies: [
            ({ auth: identity }) =>
              identity.authenticated
                ? { kind: 'allow' }
                : { kind: 'redirect', to: '/provider-login' },
          ],
        }
      );
      route('/provider-next', () => (
        <main>{`next:${currentAuth().principal?.id}`}</main>
      ));
      route('/provider-login', () => <main>login</main>);
    },
    { auth }
  );
  try {
    const rendered = await renderRouteRequestToString({
      url: '/provider-private',
      registry,
      authContext: {
        authenticated: true,
        principal: {
          id: 'packed-user',
          subject: 'packed-user',
          access_token: 'secret',
        },
        session: null,
        tenant: null,
        scopes: ['openid'],
      },
    });
    if (rendered.kind !== 'render') throw new Error('expected SSR render');
    expect(rendered.html).not.toContain('secret');
    root.innerHTML = rendered.html;
    const original = root.querySelector('main');
    await hydrateSPA({ root, registry });
    await settle();
    expect(root.querySelector('main')).toBe(original);
    expect(root.textContent).toContain('packed-user');
    expect(requests).toBe(0);
    const retained = privateHandle;
    navigate('/provider-next');
    await settle();
    expect(root.textContent).toBe('next:packed-user');
    expect(requests).toBe(0);
    const logout = auth.logout();
    expect(root.textContent).toBe('');
    expect(retained.data).toBeNull();
    releaseLogout(new Response(null, { status: 204 }));
    await logout;
    await settle();
    navigate('/provider-private');
    await settle();
    expect(root.textContent).toBe('login');
    expect(requests).toBe(1);
  } finally {
    cleanupApp(root);
    root.remove();
    history.replaceState({}, '', previousUrl);
  }
});
