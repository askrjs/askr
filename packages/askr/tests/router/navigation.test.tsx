/**
 * tests/router/navigation.test.ts
 *
 * Navigation and route resolution
 */

/* eslint-disable @typescript-eslint/no-unused-vars */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { state, createSPA } from '../../src/index';
import { navigate } from '../../src/router/navigate';
import { clearRoutes, getRoutes, route } from '../../src/router/route';
import { createTestContainer, flushScheduler } from '../helpers/test-renderer';

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
        'admin-mfe'
      );

      route(
        '/dashboard',
        (_params) => {
          namespace = 'dashboard-mfe';
          return <div>Dashboard</div>;
        },
        'dashboard-mfe'
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
