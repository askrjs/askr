import { afterEach, beforeEach, expect, it, vi } from 'vite-plus/test';
import { requireUser } from '@askrjs/auth';
import {
  createSessionAuth,
  createRouteRegistry,
  route,
  currentAuth,
  navigate,
} from '../../../src/router';
import { cleanupApp, createSPA } from '../../../src/boot';
import { getSessionAuthState } from '../../../src/router/session-auth-state';
import { resetRouterState } from '../../../src/router/reset';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';
import { loadDocument } from '../../../src/router/document-navigation';

vi.mock('../../../src/router/document-navigation', () => ({
  loadDocument: vi.fn(),
  reloadDocument: vi.fn(),
}));

const user = (id: string) => ({
  authenticated: true,
  principal: { id, subject: id },
  tenant: null,
  scopes: ['openid'],
});
const problem = {
  code: 'interaction-required',
  reason: 'login',
  provider: 'auth0',
  scopes: ['openid'],
};
async function settle() {
  for (let index = 0; index < 20; index++) {
    await Promise.resolve();
    flushScheduler();
  }
}

let view: ReturnType<typeof createTestContainer>;
beforeEach(() => {
  resetRouterState();
  view = createTestContainer();
  window.history.replaceState({}, '', '/private');
  vi.stubGlobal('BroadcastChannel', undefined);
  vi.mocked(loadDocument).mockClear();
});
afterEach(() => {
  cleanupApp(view.container);
  view.cleanup();
  resetRouterState();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  window.history.replaceState({}, '', '/');
  Reflect.deleteProperty(globalThis, Symbol.for('__ASKR_EXECUTION_MODEL__'));
});

it('should restore the signed-in app when the logout request fails', async () => {
  const transport = vi.fn((request: RequestInfo | URL) =>
    (request as Request).method === 'POST'
      ? Promise.resolve(new Response(null, { status: 500 }))
      : Promise.resolve(Response.json(user('a')))
  );
  const auth = createSessionAuth({ fetch: transport });
  const registry = createRouteRegistry(
    () => {
      route(
        '/private',
        () => <main>{`private:${currentAuth().principal?.id}`}</main>,
        { auth: requireUser() }
      );
      route('/login', () => <main>login</main>);
    },
    { auth }
  );
  await createSPA({ root: view.container, registry });
  await settle();
  expect(view.container.textContent).toBe('private:a');

  await expect(auth.logout()).rejects.toThrow('logout request failed');
  await settle();

  expect(window.location.pathname).toBe('/private');
  expect(view.container.textContent).toBe('private:a');
  expect(currentAuth().authenticated).toBe(true);
});

it('should restore the signed-in app when the logout transport rejects', async () => {
  const transport = vi.fn((request: RequestInfo | URL) =>
    (request as Request).method === 'POST'
      ? Promise.reject(new Error('offline'))
      : Promise.resolve(Response.json(user('a')))
  );
  const auth = createSessionAuth({ fetch: transport });
  const registry = createRouteRegistry(
    () => {
      route('/private', () => <main>private</main>, { auth: requireUser() });
      route('/login', () => <main>login</main>);
    },
    { auth }
  );
  await createSPA({ root: view.container, registry });
  await settle();

  await expect(auth.logout()).rejects.toThrow('offline');
  await settle();

  expect(window.location.pathname).toBe('/private');
  expect(view.container.textContent).toBe('private');
});

it('should share one recovery for reports of the same failure before navigating', async () => {
  const auth = createSessionAuth({
    fetch: vi.fn().mockResolvedValue(Response.json(user('a'))),
  });
  const registry = createRouteRegistry(
    () => {
      route('/private', () => <main>private</main>, { auth: requireUser() });
      route('/login', () => <main>login</main>);
    },
    { auth }
  );
  await createSPA({ root: view.container, registry });
  await settle();
  const state = getSessionAuthState(auth)!;
  const first = state.recover(problem, '/dashboard');
  const second = state.recover(problem, '/');
  expect(first?.href).toBe('/login?next=%2Fdashboard');
  expect(second).toBe(first);
  await settle();
  expect(window.location.pathname).toBe('/login');
  expect(new URLSearchParams(window.location.search).get('next')).toBe(
    '/dashboard'
  );
});

it('should compute a fresh login target for a later interaction failure', async () => {
  const auth = createSessionAuth({ fetch: vi.fn() });
  const state = getSessionAuthState(auth)!;
  const first = state.recover(problem, '/a');
  expect(first?.href).toBe('/login?next=%2Fa');
  // The same tick shares the target with every report of the failure.
  expect(state.recover(problem, '/other')).toBe(first);
  await Promise.resolve();
  expect(state.recover(problem, '/b?x=1')?.href).toBe(
    '/login?next=%2Fb%3Fx%3D1'
  );
});

it('should not restart the boot after a consent recovery loads the provider document', async () => {
  const consent = { ...problem, reason: 'consent' };
  let loads = 0;
  const auth = createSessionAuth({
    fetch: vi.fn().mockResolvedValue(Response.json(user('a'))),
  });
  const registry = createRouteRegistry(
    () => {
      route('/private', () => <main>private</main>, {
        auth: requireUser(),
        loader: async () => {
          loads += 1;
          throw {
            result: { ok: false, kind: 'http', status: 401, error: consent },
          };
        },
      });
      route('/login', () => <main>login</main>);
    },
    { auth }
  );
  await createSPA({ root: view.container, registry });
  await settle();
  expect(loads).toBe(1);
  expect(vi.mocked(loadDocument)).toHaveBeenCalledTimes(1);
  expect(String(vi.mocked(loadDocument).mock.calls[0][0])).toContain('auth0');
});

it('should keep the app and a pending navigation when a refocus finds the same identity', async () => {
  const visible = vi
    .spyOn(document, 'visibilityState', 'get')
    .mockReturnValue('visible');
  const gate = { resolve: () => {} };
  const transport = vi.fn().mockResolvedValue(Response.json(user('a')));
  const auth = createSessionAuth({ fetch: transport });
  let mounts = 0;
  const registry = createRouteRegistry(
    () => {
      route(
        '/private',
        () => {
          mounts += 1;
          return (
            <main>
              <input id="draft" />
            </main>
          );
        },
        { auth: requireUser() }
      );
      route('/slow', () => <main>slow</main>, {
        auth: requireUser(),
        loader: () => new Promise<void>((done) => (gate.resolve = done)),
      });
      route('/login', () => <main>login</main>);
    },
    { auth }
  );
  await createSPA({ root: view.container, registry });
  await settle();
  const input = view.container.querySelector<HTMLInputElement>('#draft')!;
  input.value = 'typed';
  navigate('/slow');
  await settle();

  visible.mockReturnValue('hidden');
  document.dispatchEvent(new Event('visibilitychange'));
  visible.mockReturnValue('visible');
  document.dispatchEvent(new Event('visibilitychange'));
  await settle();

  expect(view.container.querySelector('#draft')).toBe(input);
  expect(input.value).toBe('typed');
  expect(mounts).toBe(1);
  expect(transport).toHaveBeenCalledTimes(2);

  gate.resolve();
  await settle();
  expect(window.location.pathname).toBe('/slow');
  expect(view.container.textContent).toBe('slow');
});

it('should not let a queued auth recovery override a newer destination', async () => {
  window.history.replaceState({}, '', '/start');
  const auth = createSessionAuth({
    fetch: vi.fn().mockResolvedValue(Response.json(user('a'))),
  });
  const registry = createRouteRegistry(
    () => {
      route('/start', () => <main>start</main>);
      route('/elsewhere', () => <main>elsewhere</main>);
      route('/login', () => <main>login</main>);
    },
    { auth }
  );
  await createSPA({ root: view.container, registry });
  await settle();
  expect(view.container.textContent).toBe('start');

  expect(auth.handleAuthFailure(problem)).toBe(true);
  navigate('/elsewhere');
  await settle();

  expect(window.location.pathname).toBe('/elsewhere');
  expect(view.container.textContent).toBe('elsewhere');
});
