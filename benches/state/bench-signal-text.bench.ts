/**
 * bench_signal_text.ts
 *
 * PURPOSE: Measure scheduler + commit floor
 * - One state<number>
 * - One text node bound to it
 * - Update value 1,000 times
 */

import { bench, describe } from 'vitest';
import { createIsland, state, type State } from '../../src';
import {
  createTestContainer,
  flushScheduler,
} from '../../tests/helpers/test-renderer';

describe('bench_signal_text', () => {
  bench('1000 text updates (scheduler + commit floor)', () => {
    const { container, cleanup } = createTestContainer();
    let count!: State<number>;

    const Component = () => {
      count = state(0);
      return { type: 'div', children: [String(count())] };
    };

    createIsland({ root: container, component: Component });

    const iterations = 100;
    const start = performance.now();

    for (let i = 0; i < iterations; i++) {
      count.set(i + 1);
      flushScheduler();
    }

    const end = performance.now();
    const total = end - start;
    const avg = total / iterations;

    console.warn('\nbench_signal_text');
    console.warn(`Iterations: ${iterations}`);
    console.warn(`Total: ${total.toFixed(2)}ms`);
    console.warn(`Avg per iteration: ${avg.toFixed(4)}ms`);

    cleanup();
  });
});
