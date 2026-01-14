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
      count = state(0);
      return { type: 'div', children: [String(count())] };
    };

    createIsland({ root: container, component: Component });

    for (let r = 0; r < 10; r++) {
      burstUpdate(count, N);
      flushScheduler();
    }

    cleanup();
  }

  bench('10 rapid updates', () => {
    runBurst(10);
  });

  bench('100 rapid updates', () => {
    runBurst(100);
  });

  bench('1000 rapid updates', () => {
    runBurst(1000);
  });
});
