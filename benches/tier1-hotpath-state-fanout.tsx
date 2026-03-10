import { bench, describe, expect } from 'vitest';
import { createIsland, state } from '../src';
import {
  createTestContainer,
  flushScheduler,
} from '../tests/helpers/test-renderer';
import { tier1BenchOptions } from './_shared';

{
  const { container, cleanup } = createTestContainer();
  let valueState!: ReturnType<typeof state<number>>;

  const Component = () => {
    valueState = state(0);
    return (
      <div>
        {Array.from({ length: 1000 }, (_, index) => (
          <span data-i={index}>
            {valueState()}-{index}
          </span>
        ))}
      </div>
    );
  };

  try {
    createIsland({ root: container, component: Component });
    flushScheduler();
    valueState.set(1);
    flushScheduler();
    expect(container.textContent).toContain('1-0');
    expect(container.textContent).toContain('1-999');
  } finally {
    cleanup();
  }
}

describe('tier1 state fanout', () => {
  let cleanup: (() => void) | null = null;
  let valueState: ReturnType<typeof state<number>> | null = null;

  bench(
    'propagate one state write to 1,000 sibling spans',
    () => {
      valueState!.set(1);
      flushScheduler();
    },
    {
      ...tier1BenchOptions,
      setup() {
        const result = createTestContainer();
        cleanup = result.cleanup;

        const Component = () => {
          valueState = state(0);
          return (
            <div>
              {Array.from({ length: 1000 }, (_, index) => (
                <span data-i={index}>
                  {valueState()}-{index}
                </span>
              ))}
            </div>
          );
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
