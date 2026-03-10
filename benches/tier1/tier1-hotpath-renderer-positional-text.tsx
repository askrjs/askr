import { bench, describe, expect } from 'vitest';
import { createIsland, state } from '../../src';
import {
  createTestContainer,
  flushScheduler,
} from '../../tests/helpers/test-renderer';
import { tier1BenchOptions } from '../shared/_shared';

{
  const { container, cleanup } = createTestContainer();
  let valueState!: ReturnType<typeof state<string>>;

  const Component = () => {
    valueState = state('a');
    return {
      type: 'div',
      props: {},
      children: Array.from(
        { length: 1000 },
        (_, index) => `${valueState()}-${index}`
      ),
    };
  };

  try {
    createIsland({ root: container, component: Component });
    flushScheduler();
    valueState.set('b');
    flushScheduler();
    expect(container.textContent).toContain('b-0');
    expect(container.textContent).toContain('b-999');
  } finally {
    cleanup();
  }
}

describe('tier1 renderer positional text', () => {
  let cleanup: (() => void) | null = null;
  let valueState: ReturnType<typeof state<string>> | null = null;

  bench(
    'update 1,000 positional text nodes in one container',
    () => {
      valueState!.set('b');
      flushScheduler();
    },
    {
      ...tier1BenchOptions,
      setup() {
        const result = createTestContainer();
        cleanup = result.cleanup;

        const Component = () => {
          valueState = state('a');
          return {
            type: 'div',
            props: {},
            children: Array.from(
              { length: 1000 },
              (_, index) => `${valueState()}-${index}`
            ),
          };
        };

        createIsland({ root: result.container, component: Component });
        flushScheduler();
      },
      teardown() {
        cleanup?.();
        cleanup = null;
        valueState = null;
      },
    }
  );
});
