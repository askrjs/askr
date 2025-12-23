/**
 * Burst updates benchmark
 *
 * Measures how well rapid state updates are handled.
 * Validates coalescing and performance under update pressure.
 */

import { bench, describe, beforeEach, afterEach } from 'vitest';
import { createIsland, state } from '../../src/index';
import {
  createTestContainer,
  flushScheduler,
  waitForNextEvaluation,
} from '../../tests/helpers/test-renderer';

describe('burst updates', () => {
  let container: HTMLElement;
  let cleanup: () => void;
  let count: import('../../src/runtime/state').State<number>;

  beforeEach(async () => {
    const setup = createTestContainer();
    container = setup.container;
    cleanup = setup.cleanup;
    count = state(0);

    const Component = () => {
      return { type: 'div', children: [String(count())] };
    };

    createIsland({ root: container, component: Component });
    flushScheduler();
    await waitForNextEvaluation();
  });

  afterEach(() => {
    cleanup();
  });

  function burstUpdate(N: number) {
    for (let i = 0; i < N; i++) {
      count.set(count() + 1);
    }
  }

  bench('10 rapid updates (transactional)', async () => {
    burstUpdate(10);
    flushScheduler();
    await waitForNextEvaluation();
  });

  bench('100 rapid updates (transactional)', async () => {
    burstUpdate(100);
    flushScheduler();
    await waitForNextEvaluation();
  });

  bench('1000 rapid updates (transactional)', async () => {
    burstUpdate(1000);
    flushScheduler();
    await waitForNextEvaluation();
  });
});
