import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vite-plus/test';
import { requireAnonymous, requireUser, type AuthContext } from '@askrjs/auth';
import { cleanupApp, hydrateSPA } from '../../../src/boot';
import { renderRouteRequestToString, renderToString } from '../../../src/ssr';
import { navigate } from '../../../src/router/navigate';
import {
  createRouteRegistry,
  currentAuth,
  group,
  route,
} from '../../../src/router/route';
import type { RouteAuthOptions } from '../../../src/common/router';
import { getCurrentRenderData } from '../../../src/common/render-context';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';

const anonymous: AuthContext = {
  authenticated: false,
  principal: null,
  session: null,
  tenant: null,
};

// Identity resolved on the server from an httpOnly cookie. The browser cannot
// see the cookie, so a client resolver only ever sees an anonymous visitor.
const serverAuth: AuthContext = {
  authenticated: true,
  principal: {
    id: 'user-1',
    roles: ['member'],
    email: 'secret@example.test',
  },
  session: { id: 'session-secret-id', subject: 'user-1' },
  tenant: 'tenant-a',
};

const dehydrate: NonNullable<RouteAuthOptions['dehydrate']> = (auth) => ({
  authenticated: auth.authenticated,
  principal: auth.principal
    ? { id: auth.principal.id, roles: auth.principal.roles }
    : null,
  tenant: null,
});

let renderDataHasAuth = false;

function createRegistry(auth: RouteAuthOptions) {
  return createRouteRegistry(
    () => {
      route('/login', () => <div>{'login-page'}</div>, {
        auth: requireAnonymous(),
      });
      group({ auth: requireUser() }, () => {
        route('/dashboard', () => {
          renderDataHasAuth ||= Object.prototype.hasOwnProperty.call(
            getCurrentRenderData()?.framework ?? {},
            'au'
          );
          return (
            <main>{`dashboard:${currentAuth().principal?.id ?? 'none'}`}</main>
          );
        });
        route('/settings', () => <main>{'settings-page'}</main>);
      });
    },
    { auth: { loginPath: '/login', ...auth } }
  );
}

async function serverRender(
  registry: ReturnType<typeof createRegistry>,
  url: string
): Promise<string> {
  const rendered = await renderRouteRequestToString({
    url,
    registry,
    authContext: serverAuth,
  });
  if (rendered.kind !== 'render') throw new Error('expected render');
  return rendered.html;
}

async function settle(): Promise<void> {
  for (let index = 0; index < 5; index += 1) {
    await Promise.resolve();
    flushScheduler();
  }
}

describe('hydration auth snapshot', () => {
  let { container, cleanup } = createTestContainer();

  beforeEach(() => {
    ({ container, cleanup } = createTestContainer());
    renderDataHasAuth = false;
  });

  afterEach(() => {
    cleanupApp(container);
    cleanup();
    window.history.replaceState({}, '', '/');
  });

  it('should hydrate a protected page from the opted-in server identity', async () => {
    const resolve = vi.fn(() => anonymous);
    const registry = createRegistry({ resolve, dehydrate });

    const html = await serverRender(registry, '/dashboard');
    expect(html).toContain('dashboard:user-1');

    container.innerHTML = html;
    window.history.replaceState({}, '', '/dashboard');
    resolve.mockClear();

    await hydrateSPA({
      root: container,
      registry,
      hydrate: { verifyMarkup: true },
    });

    expect(window.location.pathname).toBe('/dashboard');
    expect(container.textContent).toBe('dashboard:user-1');
    expect(resolve).not.toHaveBeenCalled();
    expect(currentAuth()).toEqual({
      authenticated: true,
      principal: { id: 'user-1', roles: ['member'] },
      session: null,
      tenant: null,
    });
  });

  it('should hydrate from the snapshot when the app has no client resolver', async () => {
    const registry = createRegistry({ dehydrate });

    container.innerHTML = await serverRender(registry, '/dashboard');
    window.history.replaceState({}, '', '/dashboard');

    await hydrateSPA({
      root: container,
      registry,
      hydrate: { verifyMarkup: true },
    });

    expect(window.location.pathname).toBe('/dashboard');
    expect(container.textContent).toBe('dashboard:user-1');
  });

  it('should serialize only the fields the app opted in to, escaped', async () => {
    const registry = createRegistry({
      resolve: () => anonymous,
      dehydrate: (auth) => ({
        ...dehydrate(auth),
        principal: { id: '</script><script>alert(1)</script>' },
      }),
    });

    const html = await serverRender(registry, '/dashboard');
    const payload = html.slice(html.indexOf('<script type="application/json"'));

    expect(payload).toContain('\\u003C/script>\\u003Cscript>alert(1)');
    expect(payload).not.toContain('<script>alert(1)');
    expect(payload).not.toContain('secret@example.test');
    expect(payload).not.toContain('session-secret-id');
    expect(payload).not.toContain('tenant-a');
  });

  it('should not serialize any identity without an explicit opt-in', async () => {
    const registry = createRegistry({ resolve: () => anonymous });

    const html = await serverRender(registry, '/dashboard');

    expect(html).toContain('dashboard:user-1');
    const payload = html.slice(html.indexOf('<script type="application/json"'));
    expect(payload).not.toContain('user-1');
    expect(payload).not.toContain('session-secret-id');
    expect(payload).not.toContain('"authenticated"');
  });

  it('should hydrate renderToString output from the opted-in snapshot', async () => {
    const registry = createRegistry({ resolve: () => anonymous, dehydrate });

    container.innerHTML = renderToString({
      url: '/dashboard',
      registry,
      authContext: serverAuth,
    });
    window.history.replaceState({}, '', '/dashboard');

    await hydrateSPA({
      root: container,
      registry,
      hydrate: { verifyMarkup: true },
    });

    expect(window.location.pathname).toBe('/dashboard');
    expect(container.textContent).toBe('dashboard:user-1');
  });

  it('should resolve later navigations with the configured resolver', async () => {
    const resolve = vi.fn(() => anonymous);
    const registry = createRegistry({ resolve, dehydrate });

    container.innerHTML = await serverRender(registry, '/dashboard');
    window.history.replaceState({}, '', '/dashboard');
    resolve.mockClear();

    await hydrateSPA({ root: container, registry });
    expect(container.textContent).toBe('dashboard:user-1');

    navigate('/settings');
    await vi.waitFor(async () => {
      await settle();
      expect(window.location.pathname).toBe('/login');
    });

    expect(resolve).toHaveBeenCalled();
    expect(container.textContent).toBe('login-page');
  });

  it('should keep the snapshot for navigations when no resolver is configured', async () => {
    const registry = createRegistry({ dehydrate });

    container.innerHTML = await serverRender(registry, '/dashboard');
    window.history.replaceState({}, '', '/dashboard');

    await hydrateSPA({ root: container, registry });
    expect(container.textContent).toBe('dashboard:user-1');

    navigate('/settings');
    await vi.waitFor(async () => {
      await settle();
      expect(container.textContent).toBe('settings-page');
    });
    expect(window.location.pathname).toBe('/settings');

    navigate('/dashboard');
    await vi.waitFor(async () => {
      await settle();
      expect(container.textContent).toBe('dashboard:user-1');
    });
    expect(window.location.pathname).toBe('/dashboard');
  });

  it('should never serialize the session, even when dehydrate returns it', async () => {
    const registry = createRegistry({ dehydrate: (auth) => auth });

    const html = await serverRender(registry, '/dashboard');
    const payload = html.slice(html.indexOf('<script type="application/json"'));
    expect(payload).toContain('user-1');
    expect(payload).not.toContain('session-secret-id');
    expect(payload).not.toContain('"session"');

    container.innerHTML = html;
    window.history.replaceState({}, '', '/dashboard');
    await hydrateSPA({ root: container, registry });
    expect(currentAuth().session).toBeNull();
  });

  it('should not expose the snapshot through hydration render data', async () => {
    const registry = createRegistry({ dehydrate });

    container.innerHTML = await serverRender(registry, '/dashboard');
    window.history.replaceState({}, '', '/dashboard');
    await hydrateSPA({ root: container, registry });

    expect(container.textContent).toBe('dashboard:user-1');
    expect(renderDataHasAuth).toBe(false);
  });

  it.each([
    ['a non-object principal', { principal: 'user-1' }],
    ['a principal without a string id', { principal: { id: 1 } }],
    ['non-string scopes', { scopes: [1] }],
    ['a non-string tenant', { tenant: 5 }],
  ])('should reject a snapshot with %s', async (_label, patch) => {
    const registry = createRegistry({
      dehydrate: (auth) =>
        ({ ...dehydrate(auth), ...patch }) as unknown as ReturnType<
          typeof dehydrate
        >,
    });

    container.innerHTML = await serverRender(registry, '/dashboard');
    window.history.replaceState({}, '', '/dashboard');

    await expect(hydrateSPA({ root: container, registry })).rejects.toThrow(
      /Malformed hydration auth snapshot/
    );
  });
});
