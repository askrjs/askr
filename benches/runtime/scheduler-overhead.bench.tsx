/**
 * Scheduler overhead benchmark
 *
 * Measures the cost of scheduler task queuing and execution.
 * Validates that deterministic scheduling doesn't impose prohibitive overhead.
 */

import { bench, describe } from 'vitest';
import { createIsland, state } from '../../src';
import {
  createTestContainer,
  flushScheduler,
} from '../../tests/helpers/test-renderer';

describe('scheduler overhead', () => {
  bench('scheduler flush (noop)', () => {
    // Measure cost of empty scheduler operations
    for (let i = 0; i < 1000; i++) {
      flushScheduler();
    }
  });

  bench('single task execution (behavioral)', () => {
    for (let r = 0; r < 10; r++) {
      const { container, cleanup } = createTestContainer();

      const App = () => ({ type: 'div', children: ['test'] });

      createIsland({ root: container, component: App });
      // createIsland() flushes synchronously during mount.
      cleanup();
    }
  });

  bench('100 queued tasks (transactional)', () => {
    const { container, cleanup } = createTestContainer();
    let updateFn: (() => void) | null = null;

    const App = () => {
      const count = state(0);
      updateFn = () => count.set(count() + 1);

      return { type: 'div', children: [String(count())] };
    };

    createIsland({ root: container, component: App });
    // createIsland() flushes synchronously during mount.

    for (let r = 0; r < 10; r++) {
      // Queue 100 updates
      for (let i = 0; i < 100; i++) {
        updateFn!();
      }
      flushScheduler();
    }

    cleanup();
  });

  bench('100 updates + 100 commits (worst case) (transactional)', () => {
    const { container, cleanup } = createTestContainer();
    let updateFn: (() => void) | null = null;

    const App = () => {
      const count = state(0);
      updateFn = () => count.set(count() + 1);

      return { type: 'div', children: [String(count())] };
    };

    createIsland({ root: container, component: App });
    // createIsland() flushes synchronously during mount.

    // Trigger 100 updates with individual commits
    for (let i = 0; i < 100; i++) {
      updateFn!();
      flushScheduler();
    }

    cleanup();
  });
});
