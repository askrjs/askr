/**
 * State read cost benchmark
 *
 * Measures the cost of reading state values.
 * Validates that state access is effectively free.
 */

import { bench, describe } from 'vitest';
import { createIsland, state } from '../../src/index';
import {
  createTestContainer,
  flushScheduler,
} from '../../tests/helpers/test-renderer';

describe('state read cost', () => {
  bench('single state read (behavioral)', async () => {
    const { container, cleanup } = createTestContainer();

    const Component = () => {
      const value = state(42);
      return { type: 'div', children: [String(value())] };
    };

    createIsland({ root: container, component: Component });
    flushScheduler();
    await waitForNextEvaluation();

    cleanup();
  });

  bench('multiple state reads (behavioral)', async () => {
    const { container, cleanup } = createTestContainer();

    const Component = () => {
      const a = state(1);
      const b = state(2);
      const c = state(3);
      const d = state(4);
      const e = state(5);

      return {
        type: 'div',
        children: [String(a() + b() + c() + d() + e())],
      };
    };

    createIsland({ root: container, component: Component });
    flushScheduler();
    await waitForNextEvaluation();

    cleanup();
  });

  bench('computed state access (behavioral)', async () => {
    const { container, cleanup } = createTestContainer();

    const Component = () => {
      const base = state(10);
      const multiplier = state(2);

      // Simulate computed value
      const computed = base() * multiplier();

      return {
        type: 'div',
        children: [String(computed)],
      };
    };

    createIsland({ root: container, component: Component });
    flushScheduler();
    await waitForNextEvaluation();

    cleanup();
  });
});
