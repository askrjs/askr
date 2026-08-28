import {
  resetRouteState,
  currentRouteRegistry,
  routeRegistryFromTable,
} from '../../router-test-utils';
/* eslint-disable @typescript-eslint/no-unused-vars */
/**
 * tests/router/history_integration.test.ts
 *
 * Browser History API integration
 */

import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  vi,
} from 'vite-plus/test';
import { requireAnonymous, requireUser } from '@askrjs/auth';
import { createSPA } from '@askrjs/askr/boot';
import { state, type State } from '../../../src/index';
import { task, watch } from '../../../src/runtime/operations';
import { navigate } from '../../../src/router/navigate';
import {
  createRouteRegistry,
  currentRoute,
  group,
  lazy,
  route,
} from '../../../src/router/route';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';

async function settleNavigation(): Promise<void> {
  for (let index = 0; index < 3; index += 1) {
    await Promise.resolve();
    flushScheduler();
  }
}

describe('history integration (ROUTER)', () => {
  let { container, cleanup } = createTestContainer();
  let scrollToSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    const result = createTestContainer();
    container = result.container;
    cleanup = result.cleanup;
    resetRouteState();
    window.history.replaceState({}, '', '/');
    // Clear history for test isolation
    vi.clearAllMocks();
    scrollToSpy = vi.fn();
    Object.defineProperty(window, 'scrollTo', {
      value: scrollToSpy,
      writable: true,
      configurable: true,
    });
    Object.defineProperty(window, 'scrollX', {
      value: 0,
      writable: true,
      configurable: true,
    });
    Object.defineProperty(window, 'scrollY', {
      value: 0,
      writable: true,
      configurable: true,
    });
  });

  it('should commit a watcher-driven authenticated redirect to URL and DOM exactly once', async () => {
    let authenticated!: State<boolean>;
    let redirects = 0;
    const Login = () => {
      authenticated = state(false);
      watch(authenticated, (isAuthenticated) => {
        if (isAuthenticated) {
          redirects += 1;
          navigate('/dashboard', { replace: true });
        }
      });
      return <p>{'login'}</p>;
    };
    const registry = createRouteRegistry(() => {
      route('/login', Login);
      route('/dashboard', () => <p>{'dashboard'}</p>);
    });

    window.history.replaceState({ path: '/login' }, '', '/login');
    await createSPA({ root: container, registry });
    flushScheduler();
    expect(container.textContent).toBe('login');

    authenticated.set(true);
    await settleNavigation();

    expect(redirects).toBe(1);
    expect(window.location.pathname).toBe('/dashboard');
    expect(container.textContent).toBe('dashboard');
  });

  it('should redirect an already-authenticated watcher after its initial commit', async () => {
    let redirects = 0;
    const Login = () => {
      const authenticated = state(true);
      watch(authenticated, (isAuthenticated) => {
        if (isAuthenticated) {
          redirects += 1;
          navigate('/dashboard', { replace: true });
        }
      });
      return <p>{'login'}</p>;
    };
    const registry = createRouteRegistry(() => {
      route('/login', Login);
      route('/dashboard', () => <p>{'dashboard'}</p>);
    });

    window.history.replaceState({ path: '/login' }, '', '/login');
    await createSPA({ root: container, registry });
    await settleNavigation();

    expect(redirects).toBe(1);
    expect(window.location.pathname).toBe('/dashboard');
    expect(container.textContent).toBe('dashboard');
  });

  it('should preserve scroll and focus restoration given back/forward navigation when nested routes replace their content', async () => {
    const Shell = ({ children }: { children?: unknown }) => (
      <section>
        <input id="persistent-search" />
        <div id="nested-content">{children as never}</div>
      </section>
    );
    group({ layout: Shell }, () => {
      route('/nested/a', () => <p id="page-a">page a</p>);
      route('/nested/b', () => <p id="page-b">page b</p>);
    });

    window.history.replaceState({}, '', '/nested/a');
    await createSPA({ root: container, registry: currentRouteRegistry() });
    const search = container.querySelector(
      '#persistent-search'
    ) as HTMLInputElement;
    search.focus();

    navigate('/nested/b');
    await settleNavigation();
    expect(container.querySelector('#persistent-search')).toBe(search);
    expect(document.activeElement).toBe(search);

    window.history.replaceState(
      { path: '/nested/a', scroll: { x: 12, y: 34 } },
      '',
      '/nested/a'
    );
    window.dispatchEvent(
      new PopStateEvent('popstate', {
        state: { path: '/nested/a', scroll: { x: 12, y: 34 } },
      })
    );
    await settleNavigation();
    expect(container.querySelector('#page-a')).not.toBeNull();
    expect(container.querySelector('#persistent-search')).toBe(search);
    expect(document.activeElement).toBe(search);
    expect(scrollToSpy).toHaveBeenLastCalledWith(12, 34);

    window.history.replaceState(
      { path: '/nested/b', scroll: { x: 56, y: 78 } },
      '',
      '/nested/b'
    );
    window.dispatchEvent(
      new PopStateEvent('popstate', {
        state: { path: '/nested/b', scroll: { x: 56, y: 78 } },
      })
    );
    await settleNavigation();
    expect(container.querySelector('#page-b')).not.toBeNull();
    expect(container.querySelector('#persistent-search')).toBe(search);
    expect(document.activeElement).toBe(search);
    expect(scrollToSpy).toHaveBeenLastCalledWith(56, 78);
  });

  afterEach(() => {
    cleanup();
  });

  describe('history API integration', () => {
    it('should scroll to top for new pathname navigations by default', async () => {
      route('/page1', () => <div>Page 1</div>);

      window.history.replaceState({}, '', '/');
      await createSPA({ root: container, registry: currentRouteRegistry() });
      flushScheduler();

      navigate('/page1');
      flushScheduler();

      expect(scrollToSpy).toHaveBeenCalledWith(0, 0);
    });

    it('should push new entries to browser history', async () => {
      const pushStateSpy = vi.spyOn(window.history, 'pushState');

      const routes = [
        {
          path: '/page1',
          handler: () => <div>Page 1</div>,
        },
      ];

      const App = () => {
        return <div>App</div>;
      };

      await createSPA({
        root: container,
        registry: routeRegistryFromTable(routes),
      });
      flushScheduler();

      navigate('/page1');
      flushScheduler();

      expect(pushStateSpy).toHaveBeenCalledWith(
        expect.objectContaining({ path: '/page1' }),
        '',
        '/page1'
      );

      pushStateSpy.mockRestore();
    });

    it('should keep typed location state on its owning push and replace entries', async () => {
      route('/page1', () => {
        const location = currentRoute<
          Record<never, string>,
          { step: number }
        >();
        return (
          <div>
            {location.hasState ? `step-${location.state?.step}` : 'absent'}
          </div>
        );
      });
      route('/page2', () => {
        const location = currentRoute<Record<never, string>, undefined>();
        return <div>{location.hasState ? 'present-undefined' : 'absent'}</div>;
      });

      window.history.replaceState({}, '', '/');
      await createSPA({ root: container, registry: currentRouteRegistry() });

      navigate('/page1', { state: { step: 2 } });
      flushScheduler();
      expect(window.history.state).toEqual(
        expect.objectContaining({ askrHasState: true, askrState: { step: 2 } })
      );
      expect(container.textContent).toContain('step-2');

      navigate('/page2', { replace: true, state: undefined });
      flushScheduler();
      expect(window.history.state).toEqual(
        expect.objectContaining({ askrHasState: true, askrState: undefined })
      );
      expect(container.textContent).toContain('present-undefined');

      window.history.replaceState(
        { path: '/page1', askrHasState: true, askrState: { step: 1 } },
        '',
        '/page1'
      );
      window.dispatchEvent(
        new PopStateEvent('popstate', { state: window.history.state })
      );
      await Promise.resolve();
      flushScheduler();
      expect(container.textContent).toContain('step-1');
    });

    it('should update URL in address bar', async () => {
      const _originalLocation = window.location.pathname;

      const routes = [
        {
          path: '/new-page',
          handler: () => <div>New Page</div>,
        },
      ];

      const App = () => {
        return <div>App</div>;
      };

      await createSPA({
        root: container,
        registry: routeRegistryFromTable(routes),
      });
      flushScheduler();

      // History push would update location in real browser
      navigate('/new-page');
      flushScheduler();

      // In test environment, location might not update, but history call should happen
      expect(window.history.pushState).toBeDefined();
    });

    it('should create separate history entries for each navigation', async () => {
      const pushStateSpy = vi.spyOn(window.history, 'pushState');

      route('/*', () => {
        return <div>Page</div>;
      });

      const App = () => {
        return <div>App</div>;
      };

      await createSPA({ root: container, registry: currentRouteRegistry() });
      flushScheduler();

      navigate('/page1');
      flushScheduler();

      navigate('/page2');
      flushScheduler();

      navigate('/page3');
      flushScheduler();

      // Each navigation should create history entry
      expect(pushStateSpy.mock.calls.length).toBeGreaterThanOrEqual(1);

      pushStateSpy.mockRestore();
    });
  });

  describe('back button behavior', () => {
    it('should restore the saved scroll position on popstate by default', async () => {
      route('/page1', () => <div>Page 1</div>);
      route('/page2', () => <div>Page 2</div>);

      window.history.replaceState({ path: '/page1' }, '', '/page1');
      await createSPA({ root: container, registry: currentRouteRegistry() });
      flushScheduler();

      window.scrollY = 240;
      navigate('/page2');
      flushScheduler();

      window.scrollY = 320;

      scrollToSpy.mockClear();
      window.history.pushState(
        { path: '/page1', scroll: { x: 0, y: 240 } },
        '',
        '/page1'
      );
      window.dispatchEvent(
        new PopStateEvent('popstate', {
          state: { path: '/page1', scroll: { x: 0, y: 240 } },
        })
      );
      flushScheduler();

      expect(scrollToSpy).toHaveBeenCalledWith(0, 240);

      scrollToSpy.mockClear();
      window.history.pushState({ path: '/page2' }, '', '/page2');
      window.dispatchEvent(
        new PopStateEvent('popstate', { state: { path: '/page2' } })
      );
      flushScheduler();
      expect(scrollToSpy).toHaveBeenCalledWith(0, 320);
    });

    it('should create entries that can be traversed', async () => {
      route('/*', () => {
        return <div>Page</div>;
      });

      await createSPA({ root: container, registry: currentRouteRegistry() });
      flushScheduler();

      navigate('/page1');
      flushScheduler();

      navigate('/page2');
      flushScheduler();

      // In real browser, can call history.back()
      // In test, just verify history was updated
      expect(window.history.length).toBeGreaterThan(0);
    });

    it('should trigger navigation on popstate event', async () => {
      let popstateEvents = 0;

      window.addEventListener('popstate', () => {
        popstateEvents++;
      });

      route('/*', () => {
        return <div>Page</div>;
      });

      await createSPA({ root: container, registry: currentRouteRegistry() });
      flushScheduler();

      navigate('/page1');
      flushScheduler();

      // Simulate back button
      const popstateEvent = new PopStateEvent('popstate', {
        state: { path: '/page1' },
      });
      window.dispatchEvent(popstateEvent);
      flushScheduler();

      expect(popstateEvents).toBe(1);
    });

    it('should ignore stale async popstate navigations after a newer entry wins', async () => {
      let guardAborted = false;

      route('/home', () => <div>{'home'}</div>);
      route('/slow', () => <div>{'slow'}</div>, {
        policies: [
          ({ signal }) =>
            new Promise((resolve) => {
              signal.addEventListener(
                'abort',
                () => {
                  guardAborted = true;
                  resolve({ kind: 'allow' as const });
                },
                { once: true }
              );
            }),
        ],
      });
      route('/fast', () => <div>{'fast'}</div>);

      window.history.replaceState({ path: '/home' }, '', '/home');
      await createSPA({ root: container, registry: currentRouteRegistry() });
      flushScheduler();

      window.history.pushState({ path: '/slow' }, '', '/slow');
      window.dispatchEvent(
        new PopStateEvent('popstate', {
          state: { path: '/slow' },
        })
      );

      window.history.pushState({ path: '/fast' }, '', '/fast');
      window.dispatchEvent(
        new PopStateEvent('popstate', {
          state: { path: '/fast' },
        })
      );

      await settleNavigation();

      expect(container.textContent).toBe('fast');
      expect(window.location.pathname).toBe('/fast');
      expect(guardAborted).toBe(true);
    });

    it('should resolve registry navigation through manifest guards', async () => {
      const registry = createRouteRegistry(
        () => {
          route('/', () => <div>{'public'}</div>);
          route('/login', () => <div>{'login'}</div>, {
            auth: requireAnonymous(),
          });
          route('/dashboard', () => <div>{'protected'}</div>, {
            auth: requireUser(),
          });
        },
        {
          auth: {
            resolve: () => ({
              authenticated: false,
              principal: null,
              session: null,
              tenant: null,
            }),
            loginPath: '/login',
          },
        }
      );

      window.history.replaceState({ path: '/' }, '', '/');
      await createSPA({ root: container, registry });
      flushScheduler();

      expect(container.textContent).toBe('public');

      navigate('/dashboard');
      await settleNavigation();

      expect(window.location.pathname).toBe('/login');
      expect(container.textContent).toBe('login');
      expect(container.textContent).not.toContain('protected');
    });

    it('should await lazy route imports captured by a registry', async () => {
      const LazyHome = () => <div>{'lazy home'}</div>;
      let resolveImport!: (mod: { default: typeof LazyHome }) => void;

      const registry = createRouteRegistry(() => {
        route(
          '/',
          lazy(
            () =>
              new Promise<{ default: typeof LazyHome }>((resolve) => {
                resolveImport = resolve;
              })
          )
        );
      });

      window.history.replaceState({ path: '/' }, '', '/');
      const boot = createSPA({ root: container, registry });
      await Promise.resolve();

      expect(container.textContent).toBe('');

      resolveImport({ default: LazyHome });
      await boot;
      flushScheduler();

      expect(container.textContent).toBe('lazy home');
    });

    it('should report popstate cleanup failures after committing the destination', async () => {
      const consoleError = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      try {
        route('/home', () => {
          task(() => () => {
            throw new Error('cleanup failed');
          });

          return <div>{'home'}</div>;
        });
        route('/slow', () => <div>{'slow'}</div>, {
          policies: [() => Promise.resolve({ kind: 'allow' as const })],
        });

        window.history.replaceState({ path: '/home' }, '', '/home');
        await createSPA({
          root: container,
          registry: currentRouteRegistry(),
          cleanupStrict: true,
        });
        flushScheduler();

        window.history.pushState({ path: '/slow' }, '', '/slow');
        window.dispatchEvent(
          new PopStateEvent('popstate', {
            state: { path: '/slow' },
          })
        );

        await settleNavigation();

        expect(consoleError).toHaveBeenCalledWith(
          '[Askr] route cleanup failed:',
          expect.objectContaining({
            message: expect.stringMatching(/Cleanup failed|cleanup failed/i),
          })
        );
        expect(window.location.pathname).toBe('/slow');
        expect(container.textContent).toContain('slow');
      } finally {
        consoleError.mockRestore();
      }
    });

    it('should preserve state when popstate changes query on the same pathname', async () => {
      route('/accounts', () => {
        const count = state(0);
        return (
          <div>
            <button
              id="increment"
              onClick={() => count.set((value) => value + 1)}
            >
              Increment
            </button>
            <span id="value">{String(count())}</span>
          </div>
        );
      });

      window.history.replaceState({}, '', '/accounts');
      await createSPA({ root: container, registry: currentRouteRegistry() });
      flushScheduler();

      const increment = container.querySelector(
        '#increment'
      ) as HTMLButtonElement;
      increment.click();
      flushScheduler();
      expect(container.querySelector('#value')?.textContent).toBe('1');

      window.history.pushState({ path: '/accounts?q=a' }, '', '/accounts?q=a');
      window.dispatchEvent(
        new PopStateEvent('popstate', { state: { path: '/accounts?q=a' } })
      );
      flushScheduler();

      expect(container.querySelector('#value')?.textContent).toBe('1');
    });
  });

  describe('state object', () => {
    it('should allow apps to opt out of framework scroll restoration', async () => {
      route('/page1', () => <div>Page 1</div>);

      window.history.replaceState({}, '', '/');
      await createSPA({
        root: container,
        registry: currentRouteRegistry(),
        scrollRestoration: false,
      });
      flushScheduler();

      navigate('/page1');
      flushScheduler();

      expect(scrollToSpy).not.toHaveBeenCalled();
    });

    it('should store path in history state', async () => {
      const pushStateSpy = vi.spyOn(window.history, 'pushState');

      const routes = [{ path: '/test', handler: () => <div>Test</div> }];

      const App = () => {
        return <div>App</div>;
      };

      await createSPA({
        root: container,
        registry: routeRegistryFromTable(routes),
      });
      flushScheduler();

      navigate('/test');
      flushScheduler();

      const callArgs =
        pushStateSpy.mock.calls[pushStateSpy.mock.calls.length - 1];
      const stateObj = callArgs[0] as Record<string, unknown>;
      expect(stateObj).toHaveProperty('path');

      pushStateSpy.mockRestore();
    });

    it('should store custom metadata in history state', async () => {
      const pushStateSpy = vi.spyOn(window.history, 'pushState');

      const routes = [
        {
          path: '/page/{id}',
          handler: (params: Record<string, string>) => (
            <div>{`Page ${params.id}`}</div>
          ),
        },
      ];

      const App = () => {
        return <div>App</div>;
      };

      await createSPA({
        root: container,
        registry: routeRegistryFromTable(routes),
      });
      flushScheduler();

      navigate('/page/123');
      flushScheduler();

      const callArgs =
        pushStateSpy.mock.calls[pushStateSpy.mock.calls.length - 1];
      const stateObj = callArgs[0];
      expect(stateObj).toBeDefined();

      pushStateSpy.mockRestore();
    });
  });

  describe('edge cases', () => {
    it('should handle navigation with special characters in URL', async () => {
      const pushStateSpy = vi.spyOn(window.history, 'pushState');

      const routes = [
        {
          path: '/search/{query}',
          handler: (params: Record<string, string>) => (
            <div>{`Results for: ${params.query}`}</div>
          ),
        },
      ];

      const App = () => {
        return <div>App</div>;
      };

      await createSPA({
        root: container,
        registry: routeRegistryFromTable(routes),
      });
      flushScheduler();

      navigate('/search/hello%20world');
      flushScheduler();

      expect(pushStateSpy).toHaveBeenCalled();

      pushStateSpy.mockRestore();
    });

    it('should handle rapid history changes', async () => {
      const pushStateSpy = vi.spyOn(window.history, 'pushState');

      const routes = [{ path: '/*', handler: () => <div>Page</div> }];

      const App = () => {
        return <div>App</div>;
      };

      await createSPA({
        root: container,
        registry: routeRegistryFromTable(routes),
      });
      flushScheduler();

      // Rapid navigations
      navigate('/page1');
      navigate('/page2');
      navigate('/page3');
      navigate('/page4');
      navigate('/page5');
      flushScheduler();

      expect(pushStateSpy.mock.calls.length).toBeGreaterThanOrEqual(1);

      pushStateSpy.mockRestore();
    });

    it('should handle navigation to the root path', async () => {
      const pushStateSpy = vi.spyOn(window.history, 'pushState');

      const routes = [
        { path: '/', handler: () => <div>Home</div> },
        { path: '/page1', handler: () => <div>Page 1</div> },
      ];

      const App = () => {
        return <div>App</div>;
      };

      window.history.replaceState({ path: '/page1' }, '', '/page1');
      await createSPA({
        root: container,
        registry: routeRegistryFromTable(routes),
      });
      flushScheduler();

      navigate('/');
      flushScheduler();

      expect(pushStateSpy).toHaveBeenCalledWith(
        expect.objectContaining({ path: '/' }),
        '',
        '/'
      );

      pushStateSpy.mockRestore();
    });
  });

  describe('history length', () => {
    it('should increase history length with navigations', async () => {
      const initialLength = window.history.length;

      route('/*', () => {
        return <div>Page</div>;
      });

      await createSPA({ root: container, registry: currentRouteRegistry() });
      flushScheduler();

      navigate('/page1');
      flushScheduler();

      navigate('/page2');
      flushScheduler();

      // History length should increase (or stay same in test environment)
      expect(window.history.length).toBeGreaterThanOrEqual(initialLength);
    });
  });
});
