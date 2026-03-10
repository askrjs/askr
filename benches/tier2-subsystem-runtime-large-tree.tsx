import { bench, describe, expect } from 'vitest';
import { createIsland, state } from '../src';
import {
  createTestContainer,
  flushScheduler,
} from '../tests/helpers/test-renderer';
import { tier2BenchOptions } from './_shared';

{
  const { container, cleanup } = createTestContainer();
  let tickState!: ReturnType<typeof state<number>>;

  const Component = () => {
    tickState = state(0);
    return (
      <div>
        {Array.from({ length: 1000 }, (_, index) => (
          <span data-i={index}>
            {index}:{tickState()}
          </span>
        ))}
      </div>
    );
  };

  try {
    createIsland({ root: container, component: Component });
    flushScheduler();
    tickState.set(1);
    flushScheduler();
    expect(container.textContent).toContain('0:1');
    expect(container.textContent).toContain('999:1');
  } finally {
    cleanup();
  }
}

describe('tier2 runtime large tree', () => {
  let cleanup: (() => void) | null = null;
  let tickState: ReturnType<typeof state<number>> | null = null;

  bench(
    'update a 1,000-node reactive span tree',
    () => {
      tickState!.set(1);
      flushScheduler();
    },
    {
      ...tier2BenchOptions,
      setup() {
        const result = createTestContainer();
        cleanup = result.cleanup;

        const Component = () => {
          tickState = state(0);
          return (
            <div>
              {Array.from({ length: 1000 }, (_, index) => (
                <span data-i={index}>
                  {index}:{tickState()}
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
        tickState = null;
      },
    }
  );
});
