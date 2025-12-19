/**
 * Scheduler overhead benchmark
 *
 * Measures the cost of scheduler task queuing and execution.
 * Validates that deterministic scheduling doesn't impose prohibitive overhead.
 */

import { bench, describe, beforeEach, afterEach } from 'vitest';
import { createApp, state } from '../../src/index';
import {
  createTestContainer,
  flushScheduler,
} from '../../tests/helpers/test_renderer';

describe('scheduler overhead', () => {
  let container: HTMLElement;
  let cleanup: () => void;

  beforeEach(() => {
    const setup = createTestContainer();
    container = setup.container;
    cleanup = setup.cleanup;
  });

  afterEach(() => {
    cleanup();
  });

  bench('scheduler flush (noop)', async () => {
    // Measure cost of empty scheduler operations
    flushScheduler();
    await waitForNextEvaluation();
  });

  bench('single task execution (behavioral)', async () => {
    const App = () => ({ type: 'div', children: ['test'] });

    createApp({ root: container, component: App });
    flushScheduler();
    await waitForNextEvaluation();
  });

  bench('100 queued tasks (transactional)', async () => {
    let updateFn: (() => void) | null = null;

    const App = () => {
      const count = state(0);
      updateFn = () => count.set(count() + 1);

      return { type: 'div', children: [String(count())] };
    };

    createApp({ root: container, component: App });
    flushScheduler();
    await waitForNextEvaluation();

    // Queue 100 updates
    for (let i = 0; i < 100; i++) {
      updateFn!();
    }
    flushScheduler();
    await waitForNextEvaluation();
  });

  bench('100 updates + 100 commits (worst case) (transactional)', async () => {
    let updateFn: (() => void) | null = null;

    const App = () => {
      const count = state(0);
      updateFn = () => count.set(count() + 1);

      return { type: 'div', children: [String(count())] };
    };

    createApp({ root: container, component: App });
    flushScheduler();
    await waitForNextEvaluation();

    // Trigger 100 updates with individual commits
    for (let i = 0; i < 100; i++) {
      updateFn!();
      flushScheduler();
      await waitForNextEvaluation();
    }
  });
});
