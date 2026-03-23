import { bench, describe } from 'vitest';
import { createIsland, state } from '../../src';
import {
  createTestContainer,
  flushScheduler,
} from '../../tests/helpers/test-renderer';
import type { BenchToggle } from '../shared/_shared';
import {
  assertTextTransition,
  assertToggleMutationGuard,
  createSelectionToggle,
  tier1BenchOptions,
  verifyTier1Invariant,
} from '../shared/_shared';

verifyTier1Invariant('tier1 hotpath state fanout', () => {
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
    const toggle = createSelectionToggle(0, 1, 'first');

    assertToggleMutationGuard(
      container,
      () => {
        valueState.set(toggle.next());
        flushScheduler();
      },
      () => {
        valueState.set(toggle.next());
        flushScheduler();
      },
      {
        label: 'tier1 state fanout',
        afterForward: () => {
          assertTextTransition(container, '[data-i="0"]', '1-0');
          assertTextTransition(container, '[data-i="999"]', '1-999');
        },
        afterBackward: () => {
          assertTextTransition(container, '[data-i="0"]', '0-0');
          assertTextTransition(container, '[data-i="999"]', '0-999');
        },
      }
    );
  } finally {
    cleanup();
  }
});

describe('tier1 state fanout', () => {
  let cleanup: (() => void) | null = null;
  let valueState: ReturnType<typeof state<number>> | null = null;
  let toggle: BenchToggle<number> | null = null;

  bench(
    'propagate one state write to 1,000 sibling spans',
    () => {
      valueState!.set(toggle!.next());
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
        toggle = createSelectionToggle(0, 1, 'first');
      },
      teardown() {
        cleanup?.();
        cleanup = null;
        valueState = null;
        toggle = null;
      },
    }
  );
});
