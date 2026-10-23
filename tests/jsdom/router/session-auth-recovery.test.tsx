import { afterEach, beforeEach, expect, it, vi } from 'vite-plus/test';
import { requireUser } from '@askrjs/auth';
import {
  createSessionAuth,
  createRouteRegistry,
  route,
  currentAuth,
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

it('should compute a fresh login target for each interaction failure', async () => {
  const auth = createSessionAuth({ fetch: vi.fn() });
  const state = getSessionAuthState(auth)!;
  expect(state.recover(problem, '/a')?.href).toBe('/login?next=%2Fa');
  expect(state.recover(problem, '/b?x=1')?.href).toBe(
    '/login?next=%2Fb%3Fx%3D1'
  );
});
