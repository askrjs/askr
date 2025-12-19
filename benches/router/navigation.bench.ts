/**
 * Navigation benchmark
 *
 * Measures cost of client-side navigation (mount/unmount + render).
 */

import { bench, describe } from 'vitest';
import { route, clearRoutes, navigate } from '../../src/index';
import { createApp } from '../../src/index';
import {
  createTestContainer,
  flushScheduler,
  waitForNextEvaluation,
} from '../../tests/helpers/test_renderer';

describe('client navigation', () => {
  bench('simple navigate mount (behavioral)', async () => {
    clearRoutes();
    // Register two simple route handlers
    route('/home', () => ({ type: 'div', children: ['home'] }));
    route('/about', () => ({ type: 'div', children: ['about'] }));

    const { container, cleanup } = createTestContainer();

    // Mount initial route handler directly (simulate createApp on /home)
    createApp({
      root: container,
      component: () => ({ type: 'div', children: ['home'] }),
    });
    flushScheduler();
    await waitForNextEvaluation();

    // Trigger navigation to /about which should re-mount handler
    navigate('/about');
    flushScheduler();
    await waitForNextEvaluation();

    cleanup();
    clearRoutes();
  });

  bench('back/forward navigation (behavioral)', async () => {
    clearRoutes();
    const { container, cleanup } = createTestContainer();

    route('/a', () => ({ type: 'div', children: ['a'] }));
    route('/b', () => ({ type: 'div', children: ['b'] }));

    // Mount initial component
    createApp({
      root: container,
      component: () => ({ type: 'div', children: ['a'] }),
    });
    flushScheduler();
    await waitForNextEvaluation();

    // push two navigations then simulate back/forward via history API and popstate
    navigate('/b');
    flushScheduler();
    await waitForNextEvaluation();

    // Simulate back
    window.history.back();
    flushScheduler();
    await waitForNextEvaluation(); // popstate is handled by the runtime listener; allow scheduler to run

    // Simulate forward
    window.history.forward();
    flushScheduler();
    await waitForNextEvaluation();

    cleanup();
    clearRoutes();
  });
});
