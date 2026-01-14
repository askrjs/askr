import { bench, describe } from 'vitest';
import { createIsland, state } from '../../src';
import {
  createTestContainer,
  flushScheduler,
} from '../../tests/helpers/test-renderer';

describe('scheduler overhead', () => {
  bench('1000 noop flushes', () => {
    for (let i = 0; i < 1000; i++) {
      flushScheduler();
    }
  });

  bench('single task', () => {
    for (let r = 0; r < 10; r++) {
      const { container, cleanup } = createTestContainer();
      const App = () => ({ type: 'div', children: ['test'] });
      createIsland({ root: container, component: App });
      cleanup();
    }
  });

  bench('100 queued updates', () => {
    const { container, cleanup } = createTestContainer();
    let updateFn: (() => void) | null = null;

    const App = () => {
      const count = state(0);
      updateFn = () => count.set(count() + 1);
      return { type: 'div', children: [String(count())] };
    };

    createIsland({ root: container, component: App });

    for (let r = 0; r < 10; r++) {
      for (let i = 0; i < 100; i++) {
        updateFn!();
      }
      flushScheduler();
    }

    cleanup();
  });

  bench('100 updates with flushes', () => {
    const { container, cleanup } = createTestContainer();
    let updateFn: (() => void) | null = null;

    const App = () => {
      const count = state(0);
      updateFn = () => count.set(count() + 1);
      return { type: 'div', children: [String(count())] };
    };

    createIsland({ root: container, component: App });

    for (let i = 0; i < 100; i++) {
      updateFn!();
      flushScheduler();
    }

    cleanup();
  });
});
