import {
  resetRouteState,
  currentRouteManifest,
  currentRouteList,
  currentRouteRegistry,
  routeRegistryFromTable,
} from '../../router-test-utils';
import { describe, it, expect, beforeEach, afterEach } from 'vite-plus/test';
import { createSPA } from '@askrjs/askr/boot';
import { renderToStringSync } from '../../../src/ssr';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';
import { navigate } from '../../../src/router/navigate';
import {
  currentRoute,
  fallback,
  index,
  Outlet,
  page,
  resolveRouteRequest,
  route,
  setServerLocation,
  type RouteSnapshot,
} from '../../../src/router/route';

// Minimal testing window type helpers to avoid `any` casts
type TestWindow = {
  location: { pathname: string; search?: string; hash?: string };
  history: { pushState(...args: unknown[]): void };
  addEventListener: (...args: unknown[]) => void;
  removeEventListener: (...args: unknown[]) => void;
};

function setGlobalWindow(w?: TestWindow) {
  (global as unknown as { window?: TestWindow }).window = w;
}

function updateGlobalPath(path: string) {
  const gw = (global as unknown as { window?: TestWindow }).window;
  if (gw && gw.location) gw.location.pathname = path;
  else
    setGlobalWindow({
      location: { pathname: path },
      history: { pushState() {} },
      addEventListener() {},
      removeEventListener() {},
    });
}

describe('route accessor (public)', () => {
  let container: HTMLElement;
  let cleanup: () => void;

  beforeEach(() => {
    const t = createTestContainer();
    container = t.container;
    cleanup = t.cleanup;
  });

  afterEach(() => {
    cleanup();
    resetRouteState();
    setServerLocation(null);
  });

  it('should throw when called outside render', () => {
    expect(() => currentRoute()).toThrow(/currentRoute\(\) can only be called/);
    expect(() => (route as unknown as () => unknown)()).toThrow(
      /route\(\) is only for route registration/i
    );
  });

  it('should return params and keep snapshot immutable', async () => {
    let snapDuringRender: RouteSnapshot | null = null;

    const routes = [
      {
        path: '/users/{id}',
        handler: (_params: Record<string, string>) => {
          const s = currentRoute();
          snapDuringRender = s as RouteSnapshot;
          return <div>user:{s.params.id}</div>;
        },
      },
    ];

    // mount app
    // Provide a minimal window object expected by initializeNavigation
    setGlobalWindow({
      location: { pathname: '/', search: '', hash: '' },
      history: { pushState() {} },
      addEventListener() {},
      removeEventListener() {},
    });
    await createSPA({
      root: container,
      registry: routeRegistryFromTable(routes),
    });

    // navigate to user 42
    updateGlobalPath('/users/42');
    navigate('/users/42');
    await flushScheduler();

    expect(container.textContent).toBe('user:42');
    expect(snapDuringRender).not.toBeNull();
    expect(Object.isFrozen(snapDuringRender!)).toBe(true);
    expect(Object.isFrozen(snapDuringRender!.params)).toBe(true);

    // mutation attempt should not change value
    try {
      (snapDuringRender!.params as unknown as Record<string, string>).id = 'x';
    } catch {
      /* may throw in strict mode */
    }
    expect(snapDuringRender!.params.id).toBe('42');
  });

  it('should re-render on navigation', async () => {
    const routes = [
      {
        path: '/home',
        handler: () => <div>{'home'}</div>,
      },
      {
        path: '/users/{id}',
        handler: (params: Record<string, string>) => (
          <div>{`user:${params.id}`}</div>
        ),
      },
    ];

    // Provide a minimal window object expected by initializeNavigation
    setGlobalWindow({
      location: { pathname: '/home', search: '', hash: '' },
      history: { pushState() {} },
      addEventListener() {},
      removeEventListener() {},
    });

    await createSPA({
      root: container,
      registry: routeRegistryFromTable(routes),
    });

    navigate('/home');
    await flushScheduler();
    expect(container.textContent).toBe('home');

    updateGlobalPath('/users/5');
    navigate('/users/5');
    await flushScheduler();
    expect(container.textContent).toBe('user:5');
  });

  it('should preserve SSR/hydration equivalence for path, query, hash and params', async () => {
    route('/items/{id}', (params) => (
      <div>{`${params.id}|${currentRoute().query.get('q') || ''}|${currentRoute().hash || ''}`}</div>
    ));

    // Server render with explicit URL
    setServerLocation('/items/99?q=abc#frag');
    // Remove any global window to simulate server environment
    try {
      delete (global as unknown as { window?: TestWindow }).window;
    } catch {
      /* ignore - window may not be deletable in some environments */
    }

    const ServerComp = () => (
      <div>{`${currentRoute().path}|${currentRoute().query.get('q') || ''}|${currentRoute().hash || ''}`}</div>
    );

    const html = renderToStringSync(ServerComp);

    expect(html).toContain('/items/99');
    expect(html).toContain('abc');

    // Hydrate on client with same location
    setGlobalWindow({
      location: { pathname: '/items/99', search: '?q=abc', hash: '#frag' },
      history: { pushState() {} },
      addEventListener() {},
      removeEventListener() {},
    });

    await createSPA({
      root: container,
      registry: routeRegistryFromTable([
        {
          path: '/items/{id}',
          handler: (params: Record<string, string>) => (
            <div>{`${params.id}|${currentRoute().query.get('q') || ''}|${currentRoute().hash || ''}`}</div>
          ),
        },
      ]),
    });

    // Mount route handler by navigating to the path
    navigate('/items/99');
    await flushScheduler();

    // Expect the client hydration render to match server snapshot values
    expect(container.textContent).toBe('99|abc|#frag');
  });

  it('should keep currentRoute() fallback snapshots aligned with request resolution', async () => {
    let snapDuringRender: RouteSnapshot | null = null;

    const ComponentsPage = () => (
      <section>
        <h1>Components</h1>
        <Outlet />
      </section>
    );
    const ComponentsOverview = () => <div>{'overview'}</div>;
    const ComponentsMissing = () => {
      snapDuringRender = currentRoute();
      return <div>{`missing:${currentRoute().params['*']}`}</div>;
    };

    page('/docs/components', ComponentsPage, () => {
      index(ComponentsOverview);
      fallback(ComponentsMissing);
    });

    fallback(() => <div>{'root-missing'}</div>);

    const manifest = currentRouteManifest();
    const resolved = await resolveRouteRequest(
      '/docs/components/unknown/deeper',
      {
        registry: currentRouteRegistry(manifest),
      }
    );

    setGlobalWindow({
      location: { pathname: '/', search: '', hash: '' },
      history: { pushState() {} },
      addEventListener() {},
      removeEventListener() {},
    });

    await createSPA({
      root: container,
      registry: currentRouteRegistry(manifest),
    });

    updateGlobalPath('/docs/components/unknown/deeper');
    navigate('/docs/components/unknown/deeper');
    await flushScheduler();

    expect(resolved?.kind).toBe('render');
    expect(container.textContent).toContain('Components');
    expect(container.textContent).toContain('missing:/unknown/deeper');
    expect(snapDuringRender).not.toBeNull();
    expect(snapDuringRender!.path).toBe('/docs/components/unknown/deeper');
    expect(snapDuringRender!.params).toEqual(resolved!.params);
    expect(snapDuringRender!.matches.map((match) => match.path)).toEqual([
      '/docs/components/*',
    ]);
  });

  it('should prefer exact child routes over page-local and root fallbacks in snapshots', async () => {
    let snapDuringRender: RouteSnapshot | null = null;

    const ComponentsPage = () => (
      <section>
        <h1>Components</h1>
        <Outlet />
      </section>
    );
    const ComponentsOverview = () => <div>{'overview'}</div>;
    const ComponentsTabs = () => {
      snapDuringRender = currentRoute();
      return <div>{`tabs:${currentRoute().path}`}</div>;
    };

    page('/docs/components', ComponentsPage, () => {
      index(ComponentsOverview);
      route('tabs', ComponentsTabs);
      fallback(() => <div>{'page-missing'}</div>);
    });

    fallback(() => <div>{'root-missing'}</div>);

    const manifest = currentRouteManifest();
    const resolved = await resolveRouteRequest('/docs/components/tabs', {
      registry: currentRouteRegistry(manifest),
    });

    setGlobalWindow({
      location: { pathname: '/', search: '', hash: '' },
      history: { pushState() {} },
      addEventListener() {},
      removeEventListener() {},
    });

    await createSPA({
      root: container,
      registry: currentRouteRegistry(manifest),
    });

    updateGlobalPath('/docs/components/tabs');
    navigate('/docs/components/tabs');
    await flushScheduler();

    expect(resolved?.kind).toBe('render');
    expect(container.textContent).toContain('tabs:/docs/components/tabs');
    expect(container.textContent).not.toContain('page-missing');
    expect(container.textContent).not.toContain('root-missing');
    expect(snapDuringRender).not.toBeNull();
    expect(snapDuringRender!.matches.map((match) => match.path)).toEqual([
      '/docs/components/tabs',
    ]);
    expect(snapDuringRender!.params).toEqual(resolved!.params);
  });

  it('should expose the index leaf as the active match on the page pathname', async () => {
    let snapDuringRender: RouteSnapshot | null = null;

    const ComponentsPage = () => (
      <section>
        <h1>Components</h1>
        <Outlet />
      </section>
    );
    const ComponentsOverview = () => {
      snapDuringRender = currentRoute();
      return <div>{'overview'}</div>;
    };

    page('/docs/components', ComponentsPage, () => {
      index(ComponentsOverview);
      route('tabs', () => <div>{'tabs'}</div>);
      fallback(() => <div>{'page-missing'}</div>);
    });

    fallback(() => <div>{'root-missing'}</div>);

    setGlobalWindow({
      location: { pathname: '/', search: '', hash: '' },
      history: { pushState() {} },
      addEventListener() {},
      removeEventListener() {},
    });

    await createSPA({ root: container, registry: currentRouteRegistry() });

    updateGlobalPath('/docs/components');
    navigate('/docs/components');
    await flushScheduler();

    expect(container.textContent).toContain('Components');
    expect(container.textContent).toContain('overview');
    expect(snapDuringRender).not.toBeNull();
    expect(snapDuringRender!.path).toBe('/docs/components');
    expect(snapDuringRender!.params).toEqual({});
    expect(snapDuringRender!.matches.map((match) => match.path)).toEqual([
      '/docs/components',
    ]);
  });

  it('should expose the root fallback as the active match on app misses', async () => {
    let snapDuringRender: RouteSnapshot | null = null;

    route('/home', () => <div>{'home'}</div>);
    fallback(() => {
      snapDuringRender = currentRoute();
      return <div>{`root-missing:${currentRoute().params['*']}`}</div>;
    });

    const manifest = currentRouteManifest();
    const resolved = await resolveRouteRequest('/outside/deeper', {
      registry: currentRouteRegistry(manifest),
    });

    setGlobalWindow({
      location: { pathname: '/', search: '', hash: '' },
      history: { pushState() {} },
      addEventListener() {},
      removeEventListener() {},
    });

    await createSPA({
      root: container,
      registry: currentRouteRegistry(manifest),
    });

    updateGlobalPath('/outside/deeper');
    navigate('/outside/deeper');
    await flushScheduler();

    expect(resolved?.kind).toBe('render');
    expect(container.textContent).toContain('root-missing:/outside/deeper');
    expect(snapDuringRender).not.toBeNull();
    expect(snapDuringRender!.path).toBe('/outside/deeper');
    expect(snapDuringRender!.params).toEqual(resolved!.params);
    expect(snapDuringRender!.matches.map((match) => match.path)).toEqual([
      '/*',
    ]);
  });

  it('should reject route() as a render-time accessor', () => {
    expect(() =>
      renderToStringSync(() => {
        (route as unknown as () => RouteSnapshot)();
        return <div>ok</div>;
      })
    ).toThrow(/route\(\) is only for route registration/i);
  });
});
