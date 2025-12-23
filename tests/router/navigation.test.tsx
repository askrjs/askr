/**
 * tests/router/navigation.test.ts
 *
 * Navigation and route resolution
 */

/* eslint-disable @typescript-eslint/no-unused-vars */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { state, createSPA, clearRoutes, getRoutes } from '../../src/index';
import { navigate } from '../../src/router/navigate';
import { route } from '../../src/router/route';
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
        return { type: 'div', children: ['Home Page'] };
      });

      route('/about', (_params) => {
        currentPath = '/about';
        return { type: 'div', children: ['About Page'] };
      });

      const _App = (
        _props: Record<string, unknown>,
        _context?: { signal: AbortSignal }
      ) => {
        const _path = state(window?.location?.pathname || '/home');
        return {
          type: 'div',
          children: [
            {
              type: 'button',
              props: { id: 'nav-btn' },
              children: ['Navigate'],
            },
          ],
        };
      };

      await createSPA({ root: container, routes: getRoutes() });
      flushScheduler();

      expect(currentPath).toBeNull(); // Not navigated yet
    });

    it('should warn when navigating to missing routes', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const _App = () => {
        navigate('/nonexistent');
        return { type: 'div', children: ['App'] };
      };

      createIsland({ root: container, component: _App });
      flushScheduler();

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('No route found')
      );
      warnSpy.mockRestore();
    });
  });

  describe('route parameters', () => {
    it('should pass parameters to route handler when route matches', async () => {
      let receivedParams: Record<string, string> | null = null;

      route('/users/{id}', (params) => {
        receivedParams = params;
        return { type: 'div', children: [`User ${params.id}`] };
      });

      const App = () => {
        return { type: 'div', children: ['App'] };
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
        return { type: 'div', children: ['Post'] };
      });

      const App = () => {
        return { type: 'div', children: ['App'] };
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
          return { type: 'div', children: ['Admin Panel'] };
        },
        'admin-mfe'
      );

      route(
        '/dashboard',
        (_params) => {
          namespace = 'dashboard-mfe';
          return { type: 'div', children: ['Dashboard'] };
        },
        'dashboard-mfe'
      );

      const App = () => {
        return { type: 'div', children: ['App'] };
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
        return { type: 'div', children: ['Page'] };
      });

      const App = () => {
        return { type: 'div', children: ['App'] };
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
        return { type: 'div' };
      });

      route('/*', (_params) => {
        matched = 'catch-all';
        return { type: 'div' };
      });

      const App = () => {
        return { type: 'div', children: ['App'] };
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
        return { type: 'div' };
      });

      route('/*', () => {
        matched = 'catch-all';
        return { type: 'div' };
      });

      const App = () => {
        return { type: 'div', children: ['App'] };
      };

      await createSPA({ root: container, routes: getRoutes() });
      navigate('/anything/goes/here');
      flushScheduler();

      expect(matched).toBe('catch-all');
    });
  });
});
