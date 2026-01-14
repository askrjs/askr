import { bench, describe } from 'vitest';
import { createIsland, state } from '../../src';
import {
  createTestContainer,
  flushScheduler,
} from '../../tests/helpers/test-renderer';

describe('state read cost', () => {
  bench('single read', () => {
    const { container, cleanup } = createTestContainer();

    const Component = () => {
      const value = state(42);
      return { type: 'div', children: [String(value())] };
    };

    createIsland({ root: container, component: Component });
    flushScheduler();

    cleanup();
  });

  bench('multiple reads', () => {
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

    cleanup();
  });

  bench('computed access', () => {
    const { container, cleanup } = createTestContainer();

    const Component = () => {
      const base = state(10);
      const multiplier = state(2);
      const computed = base() * multiplier();

      return {
        type: 'div',
        children: [String(computed)],
      };
    };

    createIsland({ root: container, component: Component });
    flushScheduler();

    cleanup();
  });
});
