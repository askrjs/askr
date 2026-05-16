import { bench, describe } from 'vite-plus/test';
import { derive, state } from '../../src';
import { createIsland } from '../../src/boot';
import {
  createTestContainer,
  flushScheduler,
} from '../../test-utils/render/test-renderer';
import type { BenchToggle } from '../shared/_shared';
import {
  assertTextTransition,
  assertToggleMutationGuard,
  createSelectionToggle,
  tier1BenchOptions,
  verifyTier1Invariant,
} from '../shared/_shared';

verifyTier1Invariant('tier1 hotpath derived fanout', () => {
  const { container, cleanup } = createTestContainer();
  let countState!: ReturnType<typeof state<number>>;

  const Component = () => {
    countState = state(0);

    return (
      <div>
        {Array.from({ length: 1_000 }, (_, index) => {
          const derivedLabel = derive(countState, (value) => `${value}-${index}`);

          return <span data-i={index}>{derivedLabel()}</span>;
        })}
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
        countState.set(toggle.next());
        flushScheduler();
      },
      () => {
        countState.set(toggle.next());
        flushScheduler();
      },
      {
        label: 'tier1 derived fanout',
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

describe('tier1 hotpath derived fanout', () => {
  let cleanup: (() => void) | null = null;
  let countState: ReturnType<typeof state<number>> | null = null;
  let toggle: BenchToggle<number> | null = null;

  bench(
    'propagate one state write through 1,000 derived spans',
    () => {
      countState!.set(toggle!.next());
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
              {Array.from({ length: 1_000 }, (_, index) => {
                const derivedLabel = derive(countState!, (value) => `${value}-${index}`);

                return <span data-i={index}>{derivedLabel()}</span>;
              })}
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
        countState = null;
        toggle = null;
      },
    }
  );
});