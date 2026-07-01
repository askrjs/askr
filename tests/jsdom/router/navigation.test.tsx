/**
 * tests/router/navigation.test.ts
 *
 * Navigation and route resolution
 */

/* eslint-disable @typescript-eslint/no-unused-vars */
import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  vi,
} from 'vite-plus/test';
import { state } from '../../../src/index';
import { createSPA } from '@askrjs/askr/boot';
import { navigate, updateRouteQuery } from '../../../src/router/navigate';
import {
  clearRoutes,
  currentRoute,
  getRoutes,
  route,
} from '../../../src/router/route';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';

describe('route navigation (ROUTER)', () => {
  let { container, cleanup } = createTestContainer();

  beforeEach(() => {
    const result = createTestContainer();
    container = result.container;
    cleanup = result.cleanup;
    // Clear routes from previous tests
    clearRoutes();
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  describe('basic navigation', () => {
    it('should navigate to registered routes when route is requested', async () => {
      let currentPath: string | null = null;

      route('/home', (_params) => {
        currentPath = '/home';
        return <div>Home Page</div>;
      });

      route('/about', (_params) => {
        currentPath = '/about';
        return <div>About Page</div>;
      });

      const _App = (
        _props: Record<string, unknown>,
        _context?: { signal: AbortSignal }
      ) => {
        const _path = state(window?.location?.pathname || '/home');
        return (
          <div>
            <button id="nav-btn">Navigate</button>
          </div>
        );
      };

      await createSPA({ root: container, routes: getRoutes() });
      flushScheduler();

      expect(currentPath).toBeNull(); // Not navigated yet
    });

    it('should warn when navigating to missing routes', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      // createSPA requires a non-empty route table.
      route('/', (_params) => <div>Root</div>);

      await createSPA({ root: container, routes: getRoutes() });
      flushScheduler();

      navigate('/nonexistent');
      flushScheduler();

      const sawMissingRouteWarn = warnSpy.mock.calls.some((call) =>
        String(call[0]).includes('No route found')
      );
      expect(sawMissingRouteWarn).toBe(true);
      warnSpy.mockRestore();
    });

    it('should ignore imperative DOM node route output', async () => {
      const imperativeNode = document.createElement('div');
      imperativeNode.id = 'imperative-route-output';
      imperativeNode.textContent = 'Imperative route';

      route('/imperative', () => imperativeNode as unknown as string);

      await createSPA({ root: container, routes: getRoutes() });
      navigate('/imperative');
      flushScheduler();

      expect(container.querySelector('#imperative-route-output')).toBeNull();
      expect(container.textContent).toBe('');
    });
  });

  describe('route parameters', () => {
    it('should pass parameters to route handler when route matches', async () => {
      let receivedParams: Record<string, string> | null = null;

      route('/users/{id}', (params) => {
        receivedParams = params;
        return <div>User {params.id}</div>;
      });

      const App = () => {
        return <div>App</div>;
      };

      await createSPA({ root: container, routes: getRoutes() });
      navigate('/users/123');
      flushScheduler();

      expect(receivedParams).toEqual({ id: '123' });
    });

    it('should handle multiple route parameters when route matches', async () => {
      let receivedParams: Record<string, string> | null = null;

      route('/users/{userId}/posts/{postId}', (params) => {
        receivedParams = params;
        return <div>Post</div>;
      });

      const App = () => {
        return <div>App</div>;
      };

      await createSPA({ root: container, routes: getRoutes() });
      navigate('/users/42/posts/789');
      flushScheduler();

      expect(receivedParams).toEqual({ userId: '42', postId: '789' });
    });
  });

  describe('namespace routing', () => {
    it('should support namespaced routes when using micro frontends', async () => {
      let namespace: string | null = null;

      route(
        '/admin',
        (_params) => {
          namespace = 'admin-mfe';
          return <div>Admin Panel</div>;
        },
        { namespace: 'admin-mfe' }
      );

      route(
        '/dashboard',
        (_params) => {
          namespace = 'dashboard-mfe';
          return <div>Dashboard</div>;
        },
        { namespace: 'dashboard-mfe' }
      );

      const App = () => {
        return <div>App</div>;
      };

      await createSPA({ root: container, routes: getRoutes() });
      navigate('/admin');
      flushScheduler();

      expect(namespace).toBe('admin-mfe');
    });
  });

  describe('history integration', () => {
    it('should update browser history when navigating', async () => {
      const historyPushSpy = vi.spyOn(window.history, 'pushState');

      route('/page', () => {
        return <div>Page</div>;
      });

      const App = () => {
        return <div>App</div>;
      };

      await createSPA({ root: container, routes: getRoutes() });
      navigate('/page');
      flushScheduler();

      expect(historyPushSpy).toHaveBeenCalledWith(
        expect.objectContaining({ path: '/page' }),
        '',
        '/page'
      );

      historyPushSpy.mockRestore();
    });

    it('should replace browser history when navigating with replace mode', async () => {
      const historyReplaceSpy = vi.spyOn(window.history, 'replaceState');

      route('/page', () => {
        return <div>Page</div>;
      });

      await createSPA({ root: container, routes: getRoutes() });
      navigate('/page?tab=details', { history: 'replace' });
      flushScheduler();

      expect(historyReplaceSpy).toHaveBeenCalledWith(
        expect.objectContaining({ path: '/page?tab=details' }),
        '',
        '/page?tab=details'
      );

      historyReplaceSpy.mockRestore();
    });

    it('should support replace=true as a history replace alias', async () => {
      const historyPushSpy = vi.spyOn(window.history, 'pushState');
      const historyReplaceSpy = vi.spyOn(window.history, 'replaceState');

      route('/page', () => {
        return <div>Page</div>;
      });

      await createSPA({ root: container, routes: getRoutes() });
      navigate('/page?tab=details', { replace: true } as Parameters<
        typeof navigate
      >[1]);
      flushScheduler();

      expect(historyReplaceSpy).toHaveBeenCalledWith(
        expect.objectContaining({ path: '/page?tab=details' }),
        '',
        '/page?tab=details'
      );
      expect(historyPushSpy).not.toHaveBeenCalledWith(
        expect.objectContaining({ path: '/page?tab=details' }),
        '',
        '/page?tab=details'
      );

      historyPushSpy.mockRestore();
      historyReplaceSpy.mockRestore();
    });

    it('should preserve state and focus for same-path query updates', async () => {
      route('/accounts', () => {
        const query = state('');
        const clicks = state(0);

        return (
          <div>
            <input
              id="search"
              value={query()}
              onInput={(event: Event) =>
                query.set((event.target as HTMLInputElement).value)
              }
            />
            <button id="inc" onClick={() => clicks.set((value) => value + 1)}>
              Inc
            </button>
            <span id="click-count">{String(clicks())}</span>
          </div>
        );
      });

      window.history.replaceState({}, '', '/accounts');
      await createSPA({ root: container, routes: getRoutes() });
      flushScheduler();

      const input = container.querySelector('#search') as HTMLInputElement;
      const button = container.querySelector('#inc') as HTMLButtonElement;
      const countNode = container.querySelector('#click-count');

      input.focus();
      button.click();
      flushScheduler();

      expect(countNode?.textContent).toBe('1');
      expect(document.activeElement).toBe(input);

      navigate('/accounts?q=northwind', { history: 'replace' });
      flushScheduler();

      const nextInput = container.querySelector('#search') as HTMLInputElement;
      const nextCountNode = container.querySelector('#click-count');

      expect(nextCountNode?.textContent).toBe('1');
      expect(document.activeElement).toBe(nextInput);
    });

    it('should preserve same-path DOM identity when query and hash change', async () => {
      route('/accounts', () => {
        const routeSnapshot = currentRoute();
        const clicks = state(0);

        return (
          <article id="account-route">
            <button id="inc" onClick={() => clicks.set((value) => value + 1)}>
              {String(clicks())}
            </button>
            <span id="query-value">{routeSnapshot.query.get('q') ?? ''}</span>
            <span id="hash-value">{routeSnapshot.hash ?? ''}</span>
          </article>
        );
      });

      window.history.replaceState({}, '', '/accounts?q=old#one');
      await createSPA({ root: container, routes: getRoutes() });
      flushScheduler();

      const routeHost = container.querySelector('#account-route');
      const button = container.querySelector('#inc') as HTMLButtonElement;
      button.click();
      flushScheduler();

      expect(button.textContent).toBe('1');
      expect(container.querySelector('#query-value')?.textContent).toBe('old');
      expect(container.querySelector('#hash-value')?.textContent).toBe('#one');

      navigate('/accounts?q=new#two', { history: 'replace' });
      flushScheduler();

      expect(container.querySelector('#account-route')).toBe(routeHost);
      expect(container.querySelector('#inc')).toBe(button);
      expect(container.querySelector('#inc')?.textContent).toBe('1');
      expect(container.querySelector('#query-value')?.textContent).toBe('new');
      expect(container.querySelector('#hash-value')?.textContent).toBe('#two');
    });

    it('should update current route query without route navigation', async () => {
      const historyReplaceSpy = vi.spyOn(window.history, 'replaceState');
      let renderCount = 0;

      route('/accounts', () => {
        renderCount++;
        const routeSnapshot = currentRoute();
        const clicks = state(0);

        return (
          <div>
            <button id="inc" onClick={() => clicks.set((value) => value + 1)}>
              Inc
            </button>
            <span id="click-count">{String(clicks())}</span>
            <span id="query-value">{routeSnapshot.query.get('q') ?? ''}</span>
          </div>
        );
      });

      window.history.replaceState({}, '', '/accounts');
      await createSPA({ root: container, routes: getRoutes() });
      flushScheduler();

      const button = container.querySelector('#inc') as HTMLButtonElement;
      button.click();
      flushScheduler();

      expect(container.querySelector('#click-count')?.textContent).toBe('1');

      updateRouteQuery({ q: 'northwind' });
      flushScheduler();

      expect(window.location.pathname).toBe('/accounts');
      expect(window.location.search).toBe('?q=northwind');
      expect(historyReplaceSpy).toHaveBeenLastCalledWith(
        expect.objectContaining({ path: '/accounts?q=northwind' }),
        '',
        '/accounts?q=northwind'
      );
      expect(container.querySelector('#click-count')?.textContent).toBe('1');
      expect(container.querySelector('#query-value')?.textContent).toBe(
        'northwind'
      );
      expect(renderCount).toBeGreaterThanOrEqual(2);

      historyReplaceSpy.mockRestore();
    });

    it('should support deleting and appending route query values', async () => {
      const historyPushSpy = vi.spyOn(window.history, 'pushState');

      route('/accounts', () => <div>Accounts</div>);

      window.history.replaceState({}, '', '/accounts?q=old&keep=yes');
      await createSPA({ root: container, routes: getRoutes() });
      flushScheduler();

      updateRouteQuery(
        {
          q: null,
          tags: ['ops', 'billing'],
        },
        { history: 'push' }
      );

      expect(window.location.search).toBe('?keep=yes&tags=ops&tags=billing');
      expect(historyPushSpy).toHaveBeenLastCalledWith(
        expect.objectContaining({
          path: '/accounts?keep=yes&tags=ops&tags=billing',
        }),
        '',
        '/accounts?keep=yes&tags=ops&tags=billing'
      );

      historyPushSpy.mockRestore();
    });

    it('should stringify scalar query values and skip empty array entries', async () => {
      route('/accounts', () => <div>Accounts</div>);

      window.history.replaceState({}, '', '/accounts?keep=yes&q=old');
      await createSPA({ root: container, routes: getRoutes() });
      flushScheduler();

      updateRouteQuery({
        q: undefined,
        page: 2,
        archived: false,
        tags: ['ops', null, undefined, 'billing'],
        empty: [],
      });

      expect(window.location.search).toBe(
        '?keep=yes&page=2&archived=false&tags=ops&tags=billing'
      );
    });

    it('should support functional query updates and preserve the current hash', async () => {
      route('/accounts', () => {
        const routeSnapshot = currentRoute();

        return (
          <div>
            <span id="tags">{routeSnapshot.query.getAll('tag').join('|')}</span>
            <span id="page">{routeSnapshot.query.get('page') ?? ''}</span>
            <span id="hash">{routeSnapshot.hash ?? ''}</span>
          </div>
        );
      });

      window.history.replaceState({}, '', '/accounts?tag=ops#activity');
      await createSPA({ root: container, routes: getRoutes() });
      flushScheduler();

      updateRouteQuery((searchParams) => {
        searchParams.append('tag', 'billing');
        searchParams.set('page', '2');
      });
      flushScheduler();

      expect(window.location.pathname).toBe('/accounts');
      expect(window.location.search).toBe('?tag=ops&tag=billing&page=2');
      expect(window.location.hash).toBe('#activity');
      expect(container.querySelector('#tags')?.textContent).toBe('ops|billing');
      expect(container.querySelector('#page')?.textContent).toBe('2');
      expect(container.querySelector('#hash')?.textContent).toBe('#activity');
    });

    it('should not write history or rerender route readers when query is unchanged', async () => {
      const historyPushSpy = vi.spyOn(window.history, 'pushState');
      const historyReplaceSpy = vi.spyOn(window.history, 'replaceState');
      let renderCount = 0;

      route('/accounts', () => {
        renderCount++;
        const routeSnapshot = currentRoute();
        return (
          <span id="query-value">{routeSnapshot.query.get('q') ?? ''}</span>
        );
      });

      window.history.replaceState({}, '', '/accounts?q=northwind');
      await createSPA({ root: container, routes: getRoutes() });
      flushScheduler();
      historyPushSpy.mockClear();
      historyReplaceSpy.mockClear();
      const rendersAfterMount = renderCount;

      updateRouteQuery({ q: 'northwind' });
      flushScheduler();

      expect(historyPushSpy).not.toHaveBeenCalled();
      expect(historyReplaceSpy).not.toHaveBeenCalled();
      expect(renderCount).toBe(rendersAfterMount);
      expect(container.querySelector('#query-value')?.textContent).toBe(
        'northwind'
      );

      historyPushSpy.mockRestore();
      historyReplaceSpy.mockRestore();
    });

    it('should support push history mode and replace=false alias for query updates', async () => {
      const historyPushSpy = vi.spyOn(window.history, 'pushState');
      const historyReplaceSpy = vi.spyOn(window.history, 'replaceState');

      route('/accounts', () => <div>Accounts</div>);

      window.history.replaceState({}, '', '/accounts');
      await createSPA({ root: container, routes: getRoutes() });
      flushScheduler();
      historyPushSpy.mockClear();
      historyReplaceSpy.mockClear();

      updateRouteQuery({ q: 'northwind' }, { replace: false });

      expect(historyPushSpy).toHaveBeenLastCalledWith(
        expect.objectContaining({ path: '/accounts?q=northwind' }),
        '',
        '/accounts?q=northwind'
      );

      updateRouteQuery(
        { q: 'contoso' },
        { history: 'replace', replace: false }
      );

      expect(historyReplaceSpy).toHaveBeenLastCalledWith(
        expect.objectContaining({ path: '/accounts?q=contoso' }),
        '',
        '/accounts?q=contoso'
      );

      historyPushSpy.mockRestore();
      historyReplaceSpy.mockRestore();
    });
  });

  describe('route resolution order', () => {
    it('should match most specific routes first when multiple routes match', async () => {
      let matched = '';

      route('/users/{id}', (_params) => {
        matched = 'specific';
        return <div />;
      });

      route('/*', (_params) => {
        matched = 'catch-all';
        return <div />;
      });

      const App = () => {
        return <div>App</div>;
      };

      await createSPA({ root: container, routes: getRoutes() });
      navigate('/users/123');
      flushScheduler();

      expect(matched).toBe('specific');
    });

    it('should fall back to less specific routes when specific route not found', async () => {
      let matched = '';

      route('/', () => {
        matched = 'root';
        return <div />;
      });

      route('/*', () => {
        matched = 'catch-all';
        return <div />;
      });

      const App = () => {
        return <div>App</div>;
      };

      await createSPA({ root: container, routes: getRoutes() });
      navigate('/anything/goes/here');
      flushScheduler();

      expect(matched).toBe('catch-all');
    });
  });
});
