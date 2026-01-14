import { bench, describe } from 'vitest';
import { createIsland, state, type State } from '../../src';
import {
  createTestContainer,
  flushScheduler,
} from '../../tests/helpers/test-renderer';

describe('text updates', () => {
  bench('1000 updates', () => {
    const { container, cleanup } = createTestContainer();
    let count!: State<number>;

    const Component = () => {
      count = state(0);
      return { type: 'div', children: [String(count())] };
    };

    createIsland({ root: container, component: Component });

    for (let i = 0; i < 100; i++) {
      count.set(i + 1);
      flushScheduler();
    }

    cleanup();
  });
});
