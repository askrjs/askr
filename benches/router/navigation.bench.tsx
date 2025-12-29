/**
 * Navigation benchmark
 *
 * Measures cost of client-side navigation (mount/unmount + render).
 */

import { bench, describe } from 'vitest';
import { createIsland } from '../../src';
import { route, clearRoutes, navigate } from '../../src/router';
import {
  createTestContainer,
  flushScheduler,
} from '../../tests/helpers/test-renderer';

describe('client navigation', () => {
  bench('simple navigate mount (behavioral)', () => {
    clearRoutes();
    // Register two simple route handlers
    route('/home', () => ({ type: 'div', children: ['home'] }));
    route('/about', () => ({ type: 'div', children: ['about'] }));

    const { container, cleanup } = createTestContainer();

    // Mount initial route handler directly (simulate createIsland on /home)
    createIsland({
      root: container,
      component: () => ({ type: 'div', children: ['home'] }),
    });
    flushScheduler();

    // Trigger navigation to /about which should re-mount handler
    navigate('/about');
    flushScheduler();

    cleanup();
    clearRoutes();
  });

  bench('back/forward navigation (behavioral)', () => {
    clearRoutes();
    const { container, cleanup } = createTestContainer();

    route('/a', () => ({ type: 'div', children: ['a'] }));
    route('/b', () => ({ type: 'div', children: ['b'] }));

    // Mount initial component
    createIsland({
      root: container,
      component: () => ({ type: 'div', children: ['a'] }),
    });
    flushScheduler();

    // push two navigations then simulate back/forward via history API and popstate
    navigate('/b');
    flushScheduler();

    // Simulate back
    window.history.back();
    flushScheduler();

    // Simulate forward
    window.history.forward();
    flushScheduler();

    cleanup();
    clearRoutes();
  });
});
