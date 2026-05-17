import { bench, describe, expect } from 'vite-plus/test';
import { selector, state } from '../../src';
import { createIsland } from '../../src/boot';
import {
  createTestContainer,
  flushScheduler,
} from '../../test-utils/render/test-renderer';
import type { BenchToggle } from '../shared/_shared';
import {
  assertToggleMutationGuard,
  createSelectionToggle,
  extendBenchOptions,
  tier1BenchOptions,
  verifyTier1Invariant,
} from '../shared/_shared';

type RowId = number;

let selectedState!: ReturnType<typeof state<number | null>>;

function Row({ id }: { id: RowId }) {
  const isSelected = selector(selectedState);
  return (
    <tr data-id={id} class={() => (isSelected(id) ? 'danger' : '')}>
      <td>{id}</td>
    </tr>
  );
}

verifyTier1Invariant('tier1 hotpath selector fanout', () => {
  const { container, cleanup } = createTestContainer();

  const Component = () => {
    selectedState = state<number | null>(0);

    return (
      <table>
        <tbody>
          {Array.from({ length: 1_000 }, (_, id) => (
            <Row key={id} id={id} />
          ))}
        </tbody>
      </table>
    );
  };

  try {
    createIsland({ root: container, component: Component });
    flushScheduler();

    const toggle = createSelectionToggle(0, 1, 'first');

    assertToggleMutationGuard(
      container,
      () => {
        selectedState.set(toggle.next());
        flushScheduler();
      },
      () => {
        selectedState.set(toggle.next());
        flushScheduler();
      },
      {
        label: 'tier1 selector fanout',
        afterForward: () => {
          expect(container.querySelector('[data-id="0"]')?.className).toBe('');
          expect(container.querySelector('[data-id="1"]')?.className).toBe(
            'danger'
          );
        },
        afterBackward: () => {
          expect(container.querySelector('[data-id="0"]')?.className).toBe(
            'danger'
          );
          expect(container.querySelector('[data-id="1"]')?.className).toBe('');
        },
      }
    );
  } finally {
    cleanup();
  }
});

describe('tier1 hotpath selector fanout', () => {
  let cleanup: (() => void) | null = null;
  let toggle: BenchToggle<number> | null = null;
  const selectorFanoutBenchOptions = extendBenchOptions(tier1BenchOptions, {
    time: 2_400,
    warmupTime: 600,
    warmupIterations: 3,
  });

  bench(
    'move selection across 1,000 selector-backed rows',
    () => {
      selectedState!.set(toggle!.next());
      flushScheduler();
    },
    {
      ...selectorFanoutBenchOptions,
      setup() {
        const result = createTestContainer();
        cleanup = result.cleanup;

        const Component = () => {
          selectedState = state<number | null>(0);

          return (
            <table>
              <tbody>
                {Array.from({ length: 1_000 }, (_, id) => (
                  <Row key={id} id={id} />
                ))}
              </tbody>
            </table>
          );
        };

        createIsland({ root: result.container, component: Component });
        flushScheduler();
        toggle = createSelectionToggle(0, 1, 'first');
      },
      teardown() {
        cleanup?.();
        cleanup = null;
        toggle = null;
      },
    }
  );
});
