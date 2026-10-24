import { afterEach, beforeEach, expect, it, vi } from 'vite-plus/test';
import { requireUser, type AuthContext } from '@askrjs/auth';
import {
  createSessionAuth,
  createRouteRegistry,
  route,
  group,
  currentAuth,
  navigate,
  lazyRouteData,
} from '../../../src/router';
import {
  cleanupApp,
  createSPA,
  hydrateSPA,
  replaceDataRuntime,
} from '../../../src/boot';
import {
  createDataRuntime,
  createQuery,
  defineQuery,
  disposeDataRuntime,
  defineServerQueries,
  serveQuery,
  type Query,
} from '../../../src/data';
import { getSessionAuthState } from '../../../src/router/session-auth-state';
import { getAppRoot } from '../../../src/boot/root-lifecycle';
import { resetRouterState } from '../../../src/router/reset';
import { renderRouteRequestToString } from '../../../src/ssr';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';
import { loadDocument } from '../../../src/router/document-navigation';
import {
  isHydratedCsrfTokenRevoked,
  resetHydratedCsrfToken,
} from '../../../src/common/csrf-token';

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
const guest = {
  authenticated: false,
  principal: null,
  tenant: null,
  scopes: [],
};
const context = (signal = new AbortController().signal) => ({
  mode: 'spa' as const,
  params: {},
  pathname: '/private',
  search: '',
  hash: '',
  href: '/private',
  signal,
});
const problem = {
  code: 'interaction-required',
  reason: 'login',
  provider: 'auth0',
  scopes: ['openid'],
};
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
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

it('should construct only the exact minimal SSR snapshot without claims, sessions or tokens', () => {
  const auth = createSessionAuth();
  const full: AuthContext = {
    ...user('a'),
    principal: { id: 'a', subject: 'a', roles: ['admin'], email: 'private' },
    session: { id: 'secret', subject: 'a' },
  };
  expect(auth.dehydrate(full)).toEqual(user('a'));
  expect(auth.dehydrate({ ...full, authenticated: false })).toEqual(guest);
});

it('should dedupe GETs while independent cancellation leaves the other waiter live', async () => {
  const pending = deferred<Response>();
  const transport = vi.fn(
    (_input: RequestInfo | URL, _init?: RequestInit) => pending.promise
  );
  const auth = createSessionAuth({ fetch: transport });
  const abort = new AbortController();
  const first = Promise.resolve(auth.resolve(context(abort.signal)));
  const second = Promise.resolve(auth.resolve(context()));
  abort.abort();
  await expect(first).rejects.toMatchObject({ name: 'AbortError' });
  expect(transport).toHaveBeenCalledTimes(1);
  const request = transport.mock.calls[0][0] as Request;
  expect(request.url).toBe(new URL('/auth/session', window.location.href).href);
  expect(request.credentials).toBe('same-origin');
  expect(request.cache).toBe('no-store');
  expect(request.signal.aborted).toBe(false);
  pending.resolve(Response.json(user('a')));
  expect((await second).principal?.id).toBe('a');
  expect(auth.resolve(context())).toMatchObject({ principal: { id: 'a' } });
  expect(transport).toHaveBeenCalledTimes(1);
});

it('should publish its shared promise before invoking a reentrant transport', async () => {
  const pending = deferred<Response>();
  let auth!: ReturnType<typeof createSessionAuth>;
  let reentrant: AuthContext | PromiseLike<AuthContext> | undefined;
  const transport = vi.fn(() => {
    reentrant = auth.resolve(context());
    return pending.promise;
  });
  auth = createSessionAuth({ fetch: transport });

  const first = Promise.resolve(auth.resolve(context()));
  const second = Promise.resolve(reentrant).then(
    (value) => ({ value }),
    (error: unknown) => ({ error })
  );
  expect(transport).toHaveBeenCalledTimes(1);
  pending.resolve(Response.json(user('a')));

  const result = await first;
  expect(result.principal?.id).toBe('a');
  await expect(second).resolves.toEqual({ value: result });
  expect(transport).toHaveBeenCalledTimes(1);
});

it('should fence a pending pre-logout GET even when its transport ignores abort', async () => {
  const pending = deferred<Response>();
  const transport = vi.fn((request: RequestInfo | URL) =>
    (request as Request).method === 'POST'
      ? Promise.resolve(new Response(null, { status: 204 }))
      : pending.promise
  );
  const auth = createSessionAuth({ fetch: transport });
  const old = Promise.resolve(auth.resolve(context()));
  const outcome = old.catch((error: unknown) => error);
  await auth.logout();
  pending.resolve(Response.json(user('old')));
  expect(await outcome).toMatchObject({ name: 'AbortError' });
  expect(auth.resolve(context())).toMatchObject({ authenticated: false });
});

it('should reject malformed token-bearing session JSON and never cache it', async () => {
  const transport = vi
    .fn()
    .mockResolvedValueOnce(
      Response.json({ ...user('a'), access_token: 'secret' })
    )
    .mockResolvedValueOnce(Response.json(user('b')));
  const auth = createSessionAuth({ fetch: transport });
  await expect(auth.resolve(context())).rejects.toThrow(
    'Malformed provider-session snapshot'
  );
  expect((await auth.resolve(context())).principal?.id).toBe('b');
  const value = getSessionAuthState(auth)!.read()!;
  expect(Object.isFrozen(value)).toBe(true);
  expect(Object.isFrozen(value.principal)).toBe(true);
  expect(Object.isFrozen(value.scopes)).toBe(true);
});

it.each(['throw', 'reject'] as const)(
  'should preserve a transport %s failure and allow a fresh session attempt',
  async (failureMode) => {
    const failure = new Error('Session transport unavailable');
    const transport = vi
      .fn()
      .mockImplementationOnce(() => {
        if (failureMode === 'throw') throw failure;
        return Promise.reject(failure);
      })
      .mockResolvedValueOnce(Response.json(user('recovered')));
    const auth = createSessionAuth({ fetch: transport });
    const registry = createRouteRegistry(
      () =>
        route('/private', () => <main>{currentAuth().principal?.id}</main>, {
          auth: requireUser(),
        }),
      { auth }
    );

    await expect(createSPA({ root: view.container, registry })).rejects.toBe(
      failure
    );
    expect(getAppRoot(view.container)).toBeUndefined();
    expect(view.container.textContent).toBe('');
    expect(getSessionAuthState(auth)!.read()?.authenticated).not.toBe(true);
    expect(transport).toHaveBeenCalledTimes(1);

    await createSPA({ root: view.container, registry });
    expect(view.container.textContent).toBe('recovered');
    expect(transport).toHaveBeenCalledTimes(2);
    expect(auth.resolve(context())).toMatchObject({
      principal: { id: 'recovered' },
    });
    expect(transport).toHaveBeenCalledTimes(2);
  }
);

it('should build canonical provider links from safe local return targets', () => {
  const auth = createSessionAuth();
  expect(
    auth.loginHref('microsoft', {
      returnTo: '/private?a=1#x',
      resource: 'https://graph.microsoft.com',
      scopes: ['b', 'a', 'b'],
    })
  ).toBe(
    '/auth/login/microsoft?returnTo=%2Fprivate%3Fa%3D1%23x&resource=https%3A%2F%2Fgraph.microsoft.com&scope=a&scope=b'
  );
  for (const target of ['//evil.test', '/\\evil.test', 'https://evil.test'])
    expect(() => auth.loginHref('auth0', { returnTo: target })).toThrow();
  expect(() => auth.loginHref('../auth0', { returnTo: '/' })).toThrow();
});

it.each([
  null,
  [],
  'invalid',
  1,
  { fetch: 1 },
  { loginPath: '//other.test' },
  { loginPath: 1 },
])('should reject malformed session auth configuration %#', (options) => {
  expect(() => createSessionAuth(options as never)).toThrow();
});

it('should hydrate and navigate from the SSR snapshot without an extra session GET', async () => {
  const transport = vi.fn();
  const auth = createSessionAuth({ fetch: transport });
  const registry = createRouteRegistry(
    () => {
      route('/private', () => <main>{currentAuth().principal?.id}</main>, {
        auth: requireUser(),
      });
      route(
        '/next',
        () => <main>{`next:${currentAuth().principal?.id}`}</main>,
        { auth: requireUser() }
      );
      route('/login', () => <main>login</main>);
    },
    { auth }
  );
  const full = {
    ...user('a'),
    session: { id: 'secret', subject: 'a' },
  } as AuthContext;
  const rendered = await renderRouteRequestToString({
    url: '/private',
    registry,
    authContext: full,
  });
  if (rendered.kind !== 'render') throw new Error('expected SSR render');
  expect(rendered.html).not.toContain('secret');
  view.container.innerHTML = rendered.html;
  await hydrateSPA({
    root: view.container,
    registry,
    hydrate: { verifyMarkup: true },
  });
  expect(view.container.textContent).toBe('a');
  window.dispatchEvent(
    new PageTransitionEvent('pageshow', { persisted: false })
  );
  document.dispatchEvent(new Event('visibilitychange'));
  await settle();
  expect(transport).not.toHaveBeenCalled();
  navigate('/next');
  await settle();
  expect(view.container.textContent).toBe('next:a');
  expect(transport).not.toHaveBeenCalled();
});

it('should discard private route DOM and retained query handles before logout await completes', async () => {
  const logout = deferred<Response>();
  const transport = vi.fn((request: RequestInfo | URL) =>
    (request as Request).method === 'POST'
      ? logout.promise
      : Promise.resolve(Response.json(user('a')))
  );
  const auth = createSessionAuth({ fetch: transport });
  let handle!: Query<string>;
  const query = defineQuery({
    key: () => 'private',
    fetch: async () => 'private-data',
  });
  const registry = createRouteRegistry(
    () => {
      route(
        '/private',
        () => {
          handle = createQuery(query, {});
          return (
            <main>{`private:${currentAuth().principal?.id}:${handle.data ?? ''}`}</main>
          );
        },
        { auth: requireUser() }
      );
      route('/login', () => <main>login</main>);
    },
    { auth }
  );
  await createSPA({ root: view.container, registry });
  await settle();
  const old = getAppRoot(view.container)!.appRuntime!.dataRuntime!;
  const promise = auth.logout();
  expect(view.container.textContent).toBe('');
  expect(handle.data).toBeNull();
  expect(handle.error).toMatchObject({ name: 'AbortError' });
  expect(handle.loading).toBe(false);
  expect(handle.refreshing).toBe(false);
  expect(old.queryData.size).toBe(0);
  logout.resolve(new Response(null, { status: 204 }));
  await promise;
  await settle();
  expect(window.location.pathname).toBe('/login');
  expect(new URLSearchParams(window.location.search).get('next')).toBe(
    '/private'
  );
  expect(view.container.textContent).toBe('login');
});

it('should reject caller-owned data before mounting or registering a session-bound root', async () => {
  const auth = createSessionAuth({ fetch: vi.fn() });
  const registry = createRouteRegistry(
    () => route('/private', () => 'private'),
    { auth }
  );
  const runtime = createDataRuntime();
  await expect(
    createSPA({ root: view.container, registry, dataRuntime: runtime })
  ).rejects.toThrow('omit dataRuntime');
  expect(getAppRoot(view.container)).toBeUndefined();
  disposeDataRuntime(runtime);
});

it('should clear only the opted-in binding owner when a typed FetchError-like failure arrives', async () => {
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
  const runtime = createDataRuntime();
  runtime.queryData.set('unrelated', 'retained');
  expect(() => replaceDataRuntime(view.container, runtime)).toThrow(
    'Session auth owns'
  );
  expect(
    auth.handleAuthFailure({
      result: { ok: false, kind: 'http', status: 401, error: problem },
    })
  ).toBe(true);
  await settle();
  expect(window.location.pathname).toBe('/login');
  expect(view.container.textContent).toBe('login');
  expect(runtime.queryData.get('unrelated')).toBe('retained');
  disposeDataRuntime(runtime);
});

it('should revalidate cross-tab login from storage fallback and immediately clear cross-tab logout', async () => {
  const transport = vi
    .fn()
    .mockResolvedValueOnce(Response.json(user('a')))
    .mockResolvedValueOnce(Response.json(user('b')))
    .mockResolvedValueOnce(Response.json(guest));
  const auth = createSessionAuth({ fetch: transport });
  const registry = createRouteRegistry(
    () => {
      route('/private', () => <main>{currentAuth().principal?.id}</main>, {
        auth: requireUser(),
      });
      route('/login', () => <main>login</main>);
    },
    { auth }
  );
  await createSPA({ root: view.container, registry });
  window.dispatchEvent(
    new StorageEvent('storage', {
      key: '__askr_provider_session_1',
      newValue: JSON.stringify({ protocol: 1, kind: 'changed' }),
    })
  );
  expect(view.container.textContent).toBe('');
  await settle();
  expect(view.container.textContent).toBe('b');
  expect(transport).toHaveBeenCalledTimes(2);
  window.dispatchEvent(
    new StorageEvent('storage', {
      key: '__askr_provider_session_1',
      newValue: JSON.stringify({ protocol: 1, kind: 'logout' }),
    })
  );
  expect(view.container.textContent).toBe('');
  await settle();
  expect(view.container.textContent).toBe('login');
  expect(transport).toHaveBeenCalledTimes(3);
});

it('should revoke the hydration CSRF token when the session identity changes or ends', async () => {
  const transport = vi
    .fn()
    .mockResolvedValueOnce(Response.json(user('a')))
    .mockResolvedValueOnce(Response.json(user('a')))
    .mockResolvedValueOnce(Response.json(user('b')))
    .mockResolvedValueOnce(Response.json(guest));
  const auth = createSessionAuth({ fetch: transport });
  const registry = createRouteRegistry(
    () => {
      route('/private', () => <main>{currentAuth().principal?.id}</main>, {
        auth: requireUser(),
      });
      route('/login', () => <main>login</main>);
    },
    { auth }
  );
  await createSPA({ root: view.container, registry });
  expect(isHydratedCsrfTokenRevoked()).toBe(false);
  // The same identity keeps the token.
  window.dispatchEvent(
    new StorageEvent('storage', {
      key: '__askr_provider_session_1',
      newValue: JSON.stringify({ protocol: 1, kind: 'changed' }),
    })
  );
  await settle();
  expect(isHydratedCsrfTokenRevoked()).toBe(false);
  // Another identity revokes it.
  window.dispatchEvent(
    new StorageEvent('storage', {
      key: '__askr_provider_session_1',
      newValue: JSON.stringify({ protocol: 1, kind: 'changed' }),
    })
  );
  await settle();
  expect(isHydratedCsrfTokenRevoked()).toBe(true);
  // Logout revokes it as well.
  resetHydratedCsrfToken();
  window.dispatchEvent(
    new StorageEvent('storage', {
      key: '__askr_provider_session_1',
      newValue: JSON.stringify({ protocol: 1, kind: 'logout' }),
    })
  );
  await settle();
  expect(isHydratedCsrfTokenRevoked()).toBe(true);
});

it('should retire every root before publishing identity even when one cleanup throws', async () => {
  const auth = createSessionAuth({
    fetch: vi.fn().mockResolvedValue(Response.json(user('a'))),
  });
  await auth.resolve(context());
  const state = getSessionAuthState(auth)!;
  const failure = new Error('cleanup failure');
  const report = vi.fn();
  vi.stubGlobal('reportError', report);
  const observations: string[] = [];
  const first = state.attach({}, () => {
    observations.push(state.read()!.principal!.id);
    expect(() => auth.resolve(context())).toThrowError(
      expect.objectContaining({ name: 'AbortError' })
    );
    throw failure;
  });
  const second = state.attach({}, () =>
    observations.push(state.read()!.principal!.id)
  );
  expect(state.recover(problem, '/private')).toEqual({
    href: '/login?next=%2Fprivate',
    document: false,
  });
  expect(observations).toEqual(['a', 'a']);
  expect(state.read()!.authenticated).toBe(false);
  first();
  second();
  await settle();
  expect(report).toHaveBeenCalledWith(failure);
});

it('should reject an old GET promptly and never let its finally clear a newer pending GET', async () => {
  const old = deferred<Response>();
  const next = deferred<Response>();
  const transport = vi
    .fn()
    .mockReturnValueOnce(old.promise)
    .mockReturnValueOnce(next.promise);
  const auth = createSessionAuth({ fetch: transport });
  const state = getSessionAuthState(auth)!;
  const detach = state.attach({}, () => {});
  const first = Promise.resolve(auth.resolve(context()));
  const rejection = first.catch((error: unknown) => error);
  window.dispatchEvent(
    new StorageEvent('storage', {
      key: '__askr_provider_session_1',
      newValue: JSON.stringify({ protocol: 1, kind: 'changed' }),
    })
  );
  expect(await rejection).toMatchObject({ name: 'AbortError' });
  const second = Promise.resolve(auth.resolve(context()));
  old.resolve(Response.json(user('old')));
  await settle();
  const third = Promise.resolve(auth.resolve(context()));
  expect(transport).toHaveBeenCalledTimes(2);
  next.resolve(Response.json(user('new')));
  expect((await second).principal?.id).toBe('new');
  expect((await third).principal?.id).toBe('new');
  detach();
});

it('should refuse a stale SSR seed after a later live session has won', async () => {
  const auth = createSessionAuth({
    fetch: vi.fn().mockResolvedValue(Response.json(user('new'))),
  });
  await auth.resolve(context());
  expect(
    getSessionAuthState(auth)!.adopt({ ...user('old'), session: null })
  ).toBe(false);
  expect((await auth.resolve(context())).principal?.id).toBe('new');
});

it('should track and retire the new runtime when the same root is booted again with the same binding', async () => {
  const auth = createSessionAuth({
    fetch: vi.fn().mockResolvedValue(Response.json(user('a'))),
  });
  const retained: Query<string>[] = [];
  const query = defineQuery({
    key: () => 'private',
    fetch: async () => 'private-data',
  });
  const registry = createRouteRegistry(
    () => {
      route(
        '/private',
        () => {
          retained.push(createQuery(query, {}));
          return <main>{currentAuth().principal?.id}</main>;
        },
        { auth: requireUser() }
      );
      route('/login', () => <main>login</main>);
    },
    { auth }
  );
  await createSPA({ root: view.container, registry });
  await settle();
  const firstRuntime = getAppRoot(view.container)!.appRuntime!.dataRuntime!;
  await createSPA({ root: view.container, registry });
  await settle();
  const nextRuntime = getAppRoot(view.container)!.appRuntime!.dataRuntime!;
  expect(nextRuntime).not.toBe(firstRuntime);
  expect(firstRuntime.queryData.size).toBe(0);
  expect(view.container.textContent).toBe('a');
  cleanupApp(view.container);
  expect(nextRuntime.queryData.size).toBe(0);
  for (const handle of retained) expect(handle.data).toBeNull();
});

it('should recover a decoded HTTP interaction problem without following an error-supplied URL', async () => {
  const transport = vi.fn().mockResolvedValue(Response.json(user('a')));
  const auth = createSessionAuth({ fetch: transport });
  const registry = createRouteRegistry(
    () => {
      route('/private', () => <main>private</main>, { auth: requireUser() });
      route('/login', () => <main>login</main>);
    },
    { auth }
  );
  await createSPA({ root: view.container, registry });
  const response = Response.json(
    { ...problem, url: 'https://evil.test', redirect: 'https://evil.test' },
    { status: 401, headers: { 'Content-Type': 'application/problem+json' } }
  );
  const decoded = await response.json();
  expect(
    auth.handleAuthFailure({
      ok: false,
      kind: 'http',
      status: 401,
      error: decoded,
    })
  ).toBe(true);
  expect(response.bodyUsed).toBe(true);
  await settle();
  expect(window.location.pathname).toBe('/login');
  expect(transport).toHaveBeenCalledTimes(1);
  expect(auth).not.toHaveProperty('fetch');
});

it.each(['loader', 'lazy-data'] as const)(
  'should recover an initial typed %s interaction failure without publishing an error page or retrying the private loader',
  async (stage) => {
    window.history.replaceState({}, '', '/private?tab=one#section');
    const transport = vi.fn().mockResolvedValue(Response.json(user('a')));
    const auth = createSessionAuth({ fetch: transport });
    const failure = Object.assign(new Error('interaction required'), {
      result: { ok: false, kind: 'http', status: 401, error: problem },
    });
    const load = vi.fn(async () => {
      throw failure;
    });
    const registry = createRouteRegistry(
      () => {
        route('/private', () => <main>private</main>, {
          auth: requireUser(),
          loader: stage === 'loader' ? load : lazyRouteData(load),
        });
        route('/login', () => <main>login</main>);
      },
      { auth }
    );
    await createSPA({ root: view.container, registry });
    await settle();
    expect(view.container.textContent).toBe('login');
    expect(window.location.pathname).toBe('/login');
    expect(new URLSearchParams(window.location.search).get('next')).toBe(
      '/private?tab=one#section'
    );
    expect(load).toHaveBeenCalledTimes(1);
    expect(transport).toHaveBeenCalledTimes(1);
  }
);

it('should recover decoded consent through only the fixed provider login route and canonical resource', async () => {
  const auth = createSessionAuth({
    fetch: vi.fn().mockResolvedValue(Response.json(user('a'))),
  });
  const registry = createRouteRegistry(
    () => route('/private', () => <main>private</main>),
    { auth }
  );
  await createSPA({ root: view.container, registry });
  expect(
    auth.handleAuthFailure({
      ...problem,
      reason: 'consent',
      provider: 'microsoft',
      resource: 'https://graph.microsoft.com',
      scopes: ['read'],
      url: 'https://evil.test',
    })
  ).toBe(true);
  expect(view.container.textContent).toBe('');
  await settle();
  expect(loadDocument).toHaveBeenCalledTimes(1);
  const target = new URL(vi.mocked(loadDocument).mock.calls[0]![0]);
  expect(target.origin).toBe(window.location.origin);
  expect(target.pathname).toBe('/auth/login/microsoft');
  expect(target.searchParams.get('returnTo')).toBe('/private');
  expect(target.searchParams.get('resource')).toBe(
    'https://graph.microsoft.com'
  );
  expect(target.searchParams.getAll('scope')).toEqual(['read']);
});

it.each(['pageshow', 'visibility'] as const)(
  'should revalidate missed logout on %s even with BroadcastChannel and remove the owner listener on teardown',
  async (event) => {
    class Channel {
      onmessage: ((event: MessageEvent) => void) | null = null;
      postMessage() {}
      close() {}
    }
    vi.stubGlobal('BroadcastChannel', Channel);
    const visible = vi
      .spyOn(document, 'visibilityState', 'get')
      .mockReturnValue('visible');
    const transport = vi
      .fn()
      .mockResolvedValueOnce(Response.json(user('a')))
      .mockResolvedValueOnce(Response.json(guest));
    const auth = createSessionAuth({ fetch: transport });
    const registry = createRouteRegistry(
      () => {
        route('/private', () => <main>private</main>, { auth: requireUser() });
        route('/login', () => <main>login</main>);
      },
      { auth }
    );
    await createSPA({ root: view.container, registry });
    window.dispatchEvent(
      new PageTransitionEvent('pageshow', { persisted: false })
    );
    document.dispatchEvent(new Event('visibilitychange'));
    await settle();
    expect(transport).toHaveBeenCalledTimes(1);
    if (event === 'pageshow')
      window.dispatchEvent(
        new PageTransitionEvent('pageshow', { persisted: true })
      );
    else {
      visible.mockReturnValue('hidden');
      document.dispatchEvent(new Event('visibilitychange'));
      visible.mockReturnValue('visible');
      document.dispatchEvent(new Event('visibilitychange'));
    }
    // The page stays until the server confirms the identity changed.
    expect(view.container.textContent).toBe('private');
    await settle();
    expect(view.container.textContent).toBe('login');
    expect(transport).toHaveBeenCalledTimes(2);
    cleanupApp(view.container);
    window.dispatchEvent(
      new PageTransitionEvent('pageshow', { persisted: true })
    );
    visible.mockReturnValue('hidden');
    document.dispatchEvent(new Event('visibilitychange'));
    visible.mockReturnValue('visible');
    document.dispatchEvent(new Event('visibilitychange'));
    await settle();
    expect(transport).toHaveBeenCalledTimes(2);
  }
);

it.each(['loader', 'metadata'] as const)(
  'should retire an initial %s owner on logout and never publish its stale completion',
  async (stage) => {
    const started = deferred<void>();
    const blocked = deferred<{ title: string }>();
    const logout = deferred<Response>();
    const auth = createSessionAuth({
      fetch: vi.fn((input: RequestInfo | URL) =>
        (input as Request).method === 'POST'
          ? logout.promise
          : Promise.resolve(Response.json(user('a')))
      ),
    });
    let oldSignal!: AbortSignal;
    const pause = ({ signal }: { signal: AbortSignal }) => {
      oldSignal = signal;
      started.resolve();
      return blocked.promise;
    };
    const registry = createRouteRegistry(
      () => {
        route('/private', () => <main>old-private</main>, {
          auth: requireUser(),
          ...(stage === 'loader' ? { loader: pause } : { meta: pause }),
        });
        route('/login', () => <main>login</main>, { meta: { title: 'Login' } });
      },
      { auth }
    );
    const boot = createSPA({ root: view.container, registry });
    await started.promise;
    const pendingLogout = auth.logout();
    expect(oldSignal.aborted).toBe(true);
    await boot;
    expect(view.container.textContent).toBe('login');
    expect(document.title).toBe('Login');
    blocked.resolve({ title: 'Old private title' });
    await settle();
    expect(view.container.textContent).toBe('login');
    expect(document.title).toBe('Login');
    logout.resolve(new Response(null, { status: 204 }));
    await pendingLogout;
    await settle();
  }
);

it('should retire an initial loader on a cross-tab identity change and finish with the current user', async () => {
  const started = deferred<void>();
  const blocked = deferred<string>();
  let loads = 0;
  const transport = vi
    .fn()
    .mockResolvedValueOnce(Response.json(user('old')))
    .mockResolvedValueOnce(Response.json(user('new')));
  const auth = createSessionAuth({ fetch: transport });
  const registry = createRouteRegistry(
    () =>
      route('/private', () => <main>{currentAuth().principal?.id}</main>, {
        auth: requireUser(),
        loader: () => {
          if (++loads === 1) {
            started.resolve();
            return blocked.promise;
          }
          return 'current';
        },
      }),
    { auth }
  );
  const boot = createSPA({ root: view.container, registry });
  await started.promise;
  window.dispatchEvent(
    new StorageEvent('storage', {
      key: '__askr_provider_session_1',
      newValue: JSON.stringify({ protocol: 1, kind: 'changed' }),
    })
  );
  await boot;
  expect(view.container.textContent).toBe('new');
  blocked.resolve('old');
  await settle();
  expect(view.container.textContent).toBe('new');
  expect(transport).toHaveBeenCalledTimes(2);
});

it('should discard unmounted SSR private markup when logout races initial hydration metadata', async () => {
  const started = deferred<void>();
  const blocked = deferred<{ title: string }>();
  const logout = deferred<Response>();
  const auth = createSessionAuth({
    fetch: vi.fn((input: RequestInfo | URL) =>
      (input as Request).method === 'POST'
        ? logout.promise
        : Promise.resolve(Response.json(guest))
    ),
  });
  let browser = false;
  const registry = createRouteRegistry(
    () => {
      route('/private', () => <main>old-private</main>, {
        auth: requireUser(),
        meta: () => {
          if (!browser) return { title: 'SSR private' };
          started.resolve();
          return blocked.promise;
        },
      });
      route('/login', () => <main>login</main>, { meta: { title: 'Login' } });
    },
    { auth }
  );
  const rendered = await renderRouteRequestToString({
    url: '/private',
    registry,
    authContext: { ...user('a'), session: null },
  });
  if (rendered.kind !== 'render') throw new Error('expected SSR render');
  view.container.innerHTML = rendered.html;
  browser = true;
  const boot = hydrateSPA({ root: view.container, registry });
  await started.promise;
  const pendingLogout = auth.logout();
  expect(view.container.textContent).toBe('');
  await boot;
  expect(view.container.textContent).toBe('login');
  blocked.resolve({ title: 'Obsolete private' });
  await settle();
  expect(document.title).toBe('Login');
  expect(view.container.textContent).toBe('login');
  logout.resolve(new Response(null, { status: 204 }));
  await pendingLogout;
  await settle();
});

it('should announce a page binding once rather than rebroadcast every temporary boot restart', () => {
  const posted: unknown[] = [];
  class Channel {
    onmessage: ((event: MessageEvent) => void) | null = null;
    postMessage(value: unknown) {
      posted.push(value);
    }
    close() {}
  }
  vi.stubGlobal('BroadcastChannel', Channel);
  const auth = createSessionAuth();
  const state = getSessionAuthState(auth)!;
  const first = state.attach({}, () => {});
  first(true);
  const second = state.attach({}, () => {});
  second(true);
  expect(posted).toHaveLength(1);
  expect(posted[0]).toMatchObject({ protocol: 1, kind: 'changed' });
});

it('should remove a failed private app and retire its handles when the privacy DOM commit throws', async () => {
  const pending = deferred<Response>();
  const report = vi.fn();
  vi.stubGlobal('reportError', report);
  const auth = createSessionAuth({
    fetch: vi.fn((input: RequestInfo | URL) =>
      (input as Request).method === 'POST'
        ? pending.promise
        : Promise.resolve(Response.json(user('a')))
    ),
  });
  const query = defineQuery({
    key: () => 'failed:private',
    fetch: async () => 'secret',
  });
  let handle!: Query<string>;
  const registry = createRouteRegistry(
    () =>
      route('/private', () => {
        handle = createQuery(query, {});
        return <main>{handle.data}</main>;
      }),
    { auth }
  );
  await createSPA({ root: view.container, registry });
  await settle();
  const app = getAppRoot(view.container)!;
  vi.spyOn(app.root, 'render').mockImplementationOnce(() => {
    throw new Error('DOM commit failed');
  });
  const logout = auth.logout();
  expect(view.container.textContent).toBe('');
  expect(getAppRoot(view.container)).toBeUndefined();
  expect(handle.data).toBeNull();
  expect(handle.error).toMatchObject({ name: 'AbortError' });
  expect(handle.loading).toBe(false);
  expect(handle.refreshing).toBe(false);
  pending.resolve(new Response(null, { status: 204 }));
  await logout;
  await settle();
  expect(report).toHaveBeenCalledWith(expect.any(AggregateError));
});

it('should discard SSR query data without an owning auth snapshot before resolving a different live user', async () => {
  const oldQuery = defineQuery({
    key: () => 'snapshot:private',
    fetch: async () => 'old-private-data',
  });
  const serverRegistry = createRouteRegistry(() =>
    route('/private', () => <output>{createQuery(oldQuery, {}).data}</output>, {
      preload: ({ data }) => data.prefetch(oldQuery, {}),
    })
  );
  const queryRegistry = defineServerQueries(
    serveQuery(oldQuery, () => 'old-private-data')
  );
  const rendered = await renderRouteRequestToString({
    url: '/private',
    registry: serverRegistry,
    queryRegistry,
  });
  if (rendered.kind !== 'render') throw new Error('expected SSR render');
  expect(rendered.html).toContain('old-private-data');
  const transport = vi.fn().mockResolvedValue(Response.json(user('current')));
  const auth = createSessionAuth({ fetch: transport });
  const nextQuery = defineQuery({
    key: () => 'snapshot:private',
    fetch: async () => 'current-data',
  });
  const registry = createRouteRegistry(
    () =>
      route(
        '/private',
        () => (
          <output>
            {currentAuth().principal?.id}:{createQuery(nextQuery, {}).data}
          </output>
        ),
        {
          preload: ({ data }) => data.prefetch(nextQuery, {}),
        }
      ),
    { auth }
  );
  view.container.innerHTML = rendered.html;
  await hydrateSPA({ root: view.container, registry });
  await settle();
  expect(view.container.textContent).toBe('current:current-data');
  expect(transport).toHaveBeenCalledTimes(1);
});

it.each(['shape', 'projection'] as const)(
  'should discard unmounted private SSR markup and query data when the provider snapshot %s is malformed',
  async (stage) => {
    const transport = vi.fn().mockResolvedValue(Response.json(user('current')));
    const auth = createSessionAuth({ fetch: transport });
    const oldQuery = defineQuery({
      key: () => 'malformed:private',
      fetch: async () => 'old-private-data',
    });
    const serverRegistry = createRouteRegistry(
      () =>
        route(
          '/private',
          () => <output>{createQuery(oldQuery, {}).data}</output>,
          {
            preload: ({ data }) => data.prefetch(oldQuery, {}),
          }
        ),
      { auth }
    );
    const queryRegistry = defineServerQueries(
      serveQuery(oldQuery, () => 'old-private-data')
    );
    const rendered = await renderRouteRequestToString({
      url: '/private',
      registry: serverRegistry,
      queryRegistry,
      authContext: { ...user('old'), session: null },
    });
    if (rendered.kind !== 'render') throw new Error('expected SSR render');
    view.container.innerHTML = rendered.html;
    const script = view.container.querySelector(
      'script[data-askr-render-data="true"]'
    );
    if (!script) throw new Error('expected SSR query and auth payload');
    const payload = JSON.parse(script.textContent!) as {
      framework: {
        au: { authenticated: unknown; principal: { subject: unknown } };
      };
      queries: Record<string, unknown>;
    };
    expect(Object.values(payload.queries)).toContain('old-private-data');
    if (stage === 'shape') payload.framework.au.authenticated = 'bad';
    else payload.framework.au.principal.subject = 42;
    script.textContent = JSON.stringify(payload);
    const currentQuery = defineQuery({
      key: () => 'malformed:private',
      fetch: async () => 'current-data',
    });
    const registry = createRouteRegistry(
      () =>
        route(
          '/private',
          () => (
            <output>
              {currentAuth().principal?.id}:{createQuery(currentQuery, {}).data}
            </output>
          ),
          {
            preload: ({ data }) => data.prefetch(currentQuery, {}),
          }
        ),
      { auth }
    );
    await expect(
      hydrateSPA({ root: view.container, registry })
    ).rejects.toThrow('Malformed');
    expect(view.container.textContent).toBe('');
    expect(getAppRoot(view.container)).toBeUndefined();
    expect(transport).not.toHaveBeenCalled();
    await createSPA({ root: view.container, registry });
    await settle();
    expect(view.container.textContent).toBe('current:current-data');
    expect(transport).toHaveBeenCalledTimes(1);
  }
);

it('should preserve manual-mode unmounted SSR markup when its malformed auth snapshot rejects hydration', async () => {
  const registry = createRouteRegistry(
    () => route('/private', () => <main>manual-private</main>),
    {
      auth: {
        dehydrate: (value) => ({
          authenticated: value.authenticated,
          principal: value.principal,
          tenant: value.tenant,
          scopes: value.scopes,
        }),
      },
    }
  );
  const rendered = await renderRouteRequestToString({
    url: '/private',
    registry,
    authContext: { ...user('manual'), session: null },
  });
  if (rendered.kind !== 'render') throw new Error('expected SSR render');
  view.container.innerHTML = rendered.html;
  const markup = view.container.querySelector('main');
  const script = view.container.querySelector(
    'script[data-askr-render-data="true"]'
  );
  if (!script) throw new Error('expected SSR auth payload');
  const payload = JSON.parse(script.textContent!) as {
    framework: { au: { authenticated: unknown } };
  };
  payload.framework.au.authenticated = 'bad';
  script.textContent = JSON.stringify(payload);
  await expect(hydrateSPA({ root: view.container, registry })).rejects.toThrow(
    'Malformed'
  );
  expect(view.container.querySelector('main')).toBe(markup);
  expect(view.container.textContent).toBe('manual-private');
  expect(getAppRoot(view.container)).toBeUndefined();
});

it('should preserve a different binding owner while retiring only the logged-out app', async () => {
  const other = createTestContainer();
  const pending = deferred<Response>();
  const first = createSessionAuth({
    fetch: vi.fn((input: RequestInfo | URL) =>
      (input as Request).method === 'POST'
        ? pending.promise
        : Promise.resolve(Response.json(user('first')))
    ),
  });
  const second = createSessionAuth({
    fetch: vi.fn().mockResolvedValue(Response.json(user('second'))),
  });
  let firstHandle!: Query<string>;
  let secondHandle!: Query<string>;
  const one = defineQuery({
    key: () => 'first:private',
    fetch: async () => 'first-data',
  });
  const two = defineQuery({
    key: () => 'second:private',
    fetch: async () => 'second-data',
  });
  const firstRegistry = createRouteRegistry(
    () => {
      route(
        '/private',
        () => {
          firstHandle = createQuery(one, {});
          return (
            <main>
              {currentAuth().principal?.id}:{firstHandle.data}
            </main>
          );
        },
        { auth: requireUser() }
      );
      route('/login', () => <main>login</main>);
    },
    { auth: first }
  );
  const secondRegistry = createRouteRegistry(
    () =>
      route('/private', () => {
        secondHandle = createQuery(two, {});
        return (
          <main>
            {currentAuth().principal?.id}:{secondHandle.data}
          </main>
        );
      }),
    { auth: second }
  );
  try {
    await createSPA({ root: view.container, registry: firstRegistry });
    await createSPA({ root: other.container, registry: secondRegistry });
    await settle();
    expect(other.container.textContent).toBe('second:second-data');
    const logout = first.logout();
    expect(view.container.textContent).toBe('');
    expect(firstHandle.data).toBeNull();
    expect(other.container.textContent).toBe('second:second-data');
    expect(secondHandle.data).toBe('second-data');
    pending.resolve(new Response(null, { status: 204 }));
    await logout;
    await settle();
    expect(view.container.textContent).toBe('login');
    expect(other.container.textContent).toBe('second:second-data');
  } finally {
    cleanupApp(other.container);
    other.cleanup();
  }
  expect(secondHandle.data).toBeNull();
});

it.each([
  { ...user('a'), principal: { id: 'a', token: 'secret' } },
  { ...user('a'), principal: { id: '' } },
  { ...user('a'), principal: { id: 'a', subject: 2 } },
  { ...user('a'), scopes: ['openid', 2] },
  { ...guest, scopes: ['resource:read'] },
  { ...guest, principal: { id: 'a' } },
  { ...guest, tenant: 'old-tenant' },
])(
  'should reject a malformed minimal session projection %# without publishing identity',
  async (snapshot) => {
    const auth = createSessionAuth({
      fetch: vi.fn().mockResolvedValue(Response.json(snapshot)),
    });
    await expect(auth.resolve(context())).rejects.toThrow(
      'Malformed provider-session snapshot'
    );
    expect(getSessionAuthState(auth)!.read()).toBeUndefined();
  }
);

it('should leave non-interaction HTTP, network and malformed problem failures unchanged', async () => {
  const auth = createSessionAuth({
    fetch: vi.fn().mockResolvedValue(Response.json(user('a'))),
  });
  await auth.resolve(context());
  for (const failure of [
    new Error('network'),
    { code: 'other', reason: 'login', provider: 'auth0', scopes: [] },
    { result: { ok: false, kind: 'http', status: 403, error: problem } },
    { result: { ok: false, kind: 'network', status: 401, error: problem } },
    { ...problem, provider: '../auth0' },
    { ...problem, resource: '' },
    { ...problem, scopes: ['invalid scope'] },
    { ...problem, scopes: [2] },
  ])
    expect(auth.handleAuthFailure(failure)).toBe(false);
  expect(getSessionAuthState(auth)!.read()!.principal!.id).toBe('a');
});

it('should ignore malformed and queued cross-tab events after the root is detached', async () => {
  let last!: { onmessage: ((event: MessageEvent) => void) | null };
  class Channel {
    onmessage: ((event: MessageEvent) => void) | null = null;
    constructor() {
      last = this;
    }
    postMessage() {}
    close() {}
  }
  vi.stubGlobal('BroadcastChannel', Channel);
  const transport = vi.fn().mockResolvedValue(Response.json(user('a')));
  const auth = createSessionAuth({ fetch: transport });
  const registry = createRouteRegistry(
    () => route('/private', () => <main>private</main>),
    { auth }
  );
  await createSPA({ root: view.container, registry });
  const receive = last.onmessage!;
  receive(
    new MessageEvent('message', { data: { protocol: 2, kind: 'logout' } })
  );
  receive(
    new MessageEvent('message', { data: { protocol: 1, kind: 'other' } })
  );
  expect(view.container.textContent).toBe('private');
  expect(transport).toHaveBeenCalledTimes(1);
  cleanupApp(view.container);
  receive(
    new MessageEvent('message', { data: { protocol: 1, kind: 'changed' } })
  );
  await settle();
  expect(getAppRoot(view.container)).toBeUndefined();
  expect(transport).toHaveBeenCalledTimes(1);
});

it('should stop an old navigation metadata chain before head publication after logout', async () => {
  const started = deferred<void>();
  const blocked = deferred<{ title: string }>();
  const logout = deferred<Response>();
  const later = vi.fn(() => ({ title: 'Stale private title' }));
  const auth = createSessionAuth({
    fetch: vi.fn((input: RequestInfo | URL) =>
      (input as Request).method === 'POST'
        ? logout.promise
        : Promise.resolve(Response.json(user('a')))
    ),
  });
  const registry = createRouteRegistry(
    () => {
      route('/private', () => <main>private</main>, { auth: requireUser() });
      group(
        {
          meta: () => {
            started.resolve();
            return blocked.promise;
          },
        },
        () => {
          route('/pending', () => <main>pending-private</main>, {
            auth: requireUser(),
            meta: later,
          });
        }
      );
      route('/login', () => <main>login</main>, { meta: { title: 'Login' } });
    },
    { auth }
  );
  await createSPA({ root: view.container, registry });
  navigate('/pending');
  await started.promise;
  const operation = auth.logout();
  logout.resolve(new Response(null, { status: 204 }));
  await operation;
  await settle();
  expect(view.container.textContent).toBe('login');
  expect(document.title).toBe('Login');
  blocked.resolve({ title: 'Old parent' });
  await settle();
  // Sources run in parallel, so a later one may have started; none publishes.
  expect(document.title).toBe('Login');
});
