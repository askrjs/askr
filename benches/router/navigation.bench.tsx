import { bench, describe } from 'vitest';
import { createIsland } from '../../src';
import { route, clearRoutes, navigate } from '../../src/router';
import {
  createTestContainer,
  flushScheduler,
} from '../../tests/helpers/test-renderer';

describe('navigation', () => {
  bench('simple navigate mount', () => {
    clearRoutes();
    route('/home', () => ({ type: 'div', children: ['home'] }));
    route('/about', () => ({ type: 'div', children: ['about'] }));

    const { container, cleanup } = createTestContainer();

    createIsland({
      root: container,
      component: () => ({ type: 'div', children: ['home'] }),
    });
    flushScheduler();

    navigate('/about');
    flushScheduler();

    cleanup();
    clearRoutes();
  });

  bench('back/forward', () => {
    clearRoutes();
    const { container, cleanup } = createTestContainer();

    route('/a', () => ({ type: 'div', children: ['a'] }));
    route('/b', () => ({ type: 'div', children: ['b'] }));

    createIsland({
      root: container,
      component: () => ({ type: 'div', children: ['a'] }),
    });
    flushScheduler();

    navigate('/b');
    flushScheduler();

    window.history.back();
    flushScheduler();

    window.history.forward();
    flushScheduler();

    cleanup();
    clearRoutes();
  });
});
