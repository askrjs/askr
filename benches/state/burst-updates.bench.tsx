/**
 * Burst updates benchmark
 *
 * Measures how well rapid state updates are handled.
 * Validates coalescing and performance under update pressure.
 */

import { bench, describe } from 'vitest';
import { createIsland, state, type State } from '../../src';
import {
  createTestContainer,
  flushScheduler,
} from '../../tests/helpers/test-renderer';

describe('burst updates', () => {
  function burstUpdate(count: State<number>, N: number) {
    for (let i = 0; i < N; i++) {
      count.set(count() + 1);
    }
  }

  function runBurst(N: number) {
    const { container, cleanup } = createTestContainer();
    let count!: State<number>;

    const Component = () => {
      // state() must be called during component render.
      count = state(0);
      return { type: 'div', children: [String(count())] };
    };

    createIsland({ root: container, component: Component });
    // createIsland() flushes synchronously during mount.

    // Make each sample large enough to avoid NaN timings.
    // Keep this constant across N so comparisons remain meaningful.
    for (let r = 0; r < 10; r++) {
      burstUpdate(count, N);
      flushScheduler();
    }

    cleanup();
  }

  bench('10 rapid updates (transactional)', () => {
    runBurst(10);
  });

  bench('100 rapid updates (transactional)', () => {
    runBurst(100);
  });

  bench('1000 rapid updates (transactional)', () => {
    runBurst(1000);
  });
});
