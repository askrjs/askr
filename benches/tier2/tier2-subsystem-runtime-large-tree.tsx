import { bench, describe } from 'vite-plus/test';
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
  tier2BenchOptions,
} from '../shared/_shared';

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
    const toggle = createSelectionToggle(0, 1, 'first');

    assertToggleMutationGuard(
      container,
      () => {
        tickState.set(toggle.next());
        flushScheduler();
      },
      () => {
        tickState.set(toggle.next());
        flushScheduler();
      },
      {
        label: 'tier2 runtime large tree',
        afterForward: () => {
          assertTextTransition(container, '[data-i="0"]', '0:1');
          assertTextTransition(container, '[data-i="999"]', '999:1');
        },
        afterBackward: () => {
          assertTextTransition(container, '[data-i="0"]', '0:0');
          assertTextTransition(container, '[data-i="999"]', '999:0');
        },
      }
    );
  } finally {
    cleanup();
  }
}

describe('tier2 runtime large tree', () => {
  let cleanup: (() => void) | null = null;
  let tickState: ReturnType<typeof state<number>> | null = null;
  let toggle: BenchToggle<number> | null = null;

  bench(
    'update a 1,000-node reactive span tree',
    () => {
      tickState!.set(toggle!.next());
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
                  {index}:{tickState!()}
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
        tickState = null;
        toggle = null;
      },
    }
  );
});
