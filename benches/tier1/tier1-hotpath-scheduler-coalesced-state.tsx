import { bench, describe, expect } from 'vite-plus/test';
import { state } from '../../src';
import { createIsland } from '../../src/boot';
import {
  clearScheduler,
  getSchedulerState,
} from '../../src/core/reactive/scheduler';
import {
  createTestContainer,
  flushScheduler,
} from '../../test-utils/render/test-renderer';
import { tier1BenchOptions, verifyTier1Invariant } from '../shared/_shared';

verifyTier1Invariant('tier1 hotpath scheduler coalesced state', () => {
  const { container, cleanup } = createTestContainer();
  let countState!: ReturnType<typeof state<number>>;

  const Component = () => {
    countState = state(0);

    return (
      <div>
        {Array.from({ length: 200 }, (_, index) => (
          <span class="subscriber" data-i={index}>
            {countState()}-{index}
          </span>
        ))}
      </div>
    );
  };

  try {
    createIsland({ root: container, component: Component });
    flushScheduler();

    for (let value = 1; value <= 100; value += 1) {
      countState.set(value);
    }
    flushScheduler();

    expect(container.querySelector('.subscriber')?.textContent).toBe('100-0');
    expect(container.querySelector('[data-i="199"]')?.textContent).toBe(
      '100-199'
    );
    expect(getSchedulerState().queueLength).toBe(0);
    expect(getSchedulerState().running).toBe(false);
  } finally {
    cleanup();
    clearScheduler();
  }
});

describe('tier1 hotpath scheduler coalesced state', () => {
  let cleanup: (() => void) | null = null;
  let countState: ReturnType<typeof state<number>> | null = null;

  bench(
    'coalesce 100 synchronous state writes before one flush',
    () => {
      for (let value = 1; value <= 100; value += 1) {
        countState!.set(value);
      }
      flushScheduler();
    },
    {
      ...tier1BenchOptions,
      setup() {
        const result = createTestContainer();
        cleanup = result.cleanup;

        const Component = () => {
          countState = state(0);

          return (
            <div>
              {Array.from({ length: 200 }, (_, index) => (
                <span class="subscriber" data-i={index}>
                  {countState!()}-{index}
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
        countState = null;
        clearScheduler();
      },
    }
  );
});
