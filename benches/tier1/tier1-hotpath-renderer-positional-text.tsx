import { bench, describe } from 'vite-plus/test';
import { state } from '../../src';
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

verifyTier1Invariant('tier1 hotpath renderer positional text', () => {
  const { container, cleanup } = createTestContainer();
  let valueState!: ReturnType<typeof state<string>>;

  const Component = () => {
    valueState = state('a');
    return (
      <div>
        {Array.from({ length: 1000 }, (_, index) => `${valueState()}-${index}`)}
      </div>
    );
  };

  try {
    createIsland({ root: container, component: Component });
    flushScheduler();
    const toggle = createSelectionToggle('a', 'b', 'first');

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
        label: 'tier1 renderer positional text',
        afterForward: () => {
          assertTextTransition(container, 'div', 'b-0');
          assertTextTransition(container, 'div', 'b-999');
        },
        afterBackward: () => {
          assertTextTransition(container, 'div', 'a-0');
          assertTextTransition(container, 'div', 'a-999');
        },
      }
    );
  } finally {
    cleanup();
  }
});

describe('tier1 renderer positional text', () => {
  let cleanup: (() => void) | null = null;
  let valueState: ReturnType<typeof state<string>> | null = null;
  let toggle: BenchToggle<string> | null = null;

  bench(
    'update 1,000 positional text nodes in one container',
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
          valueState = state('a');
          return (
            <div>
              {Array.from(
                { length: 1000 },
                (_, index) => `${valueState!()}-${index}`
              )}
            </div>
          );
        };

        createIsland({ root: result.container, component: Component });
        flushScheduler();
        toggle = createSelectionToggle('a', 'b', 'first');
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
