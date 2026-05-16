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
  tier1BenchOptions,
  verifyTier1Invariant,
} from '../shared/_shared';

type RowId = number;
type IsSelected = (candidate: RowId) => boolean;

function Row({ id, isSelected }: { id: RowId; isSelected: IsSelected }) {
  return (
    <tr data-id={id} class={() => (isSelected(id) ? 'danger' : '')}>
      <td>{id}</td>
    </tr>
  );
}

verifyTier1Invariant('tier1 hotpath selector fanout', () => {
  const { container, cleanup } = createTestContainer();
  let selectedState!: ReturnType<typeof state<number | null>>;

  const Component = () => {
    selectedState = state<number | null>(0);
    const isSelected = selector(selectedState);

    return (
      <table>
        <tbody>
          {Array.from({ length: 1_000 }, (_, id) => (
            <Row key={id} id={id} isSelected={isSelected} />
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
  let selectedState: ReturnType<typeof state<number | null>> | null = null;
  let toggle: BenchToggle<number> | null = null;

  bench(
    'move selection across 1,000 selector-backed rows',
    () => {
      selectedState!.set(toggle!.next());
      flushScheduler();
    },
    {
      ...tier1BenchOptions,
      setup() {
        const result = createTestContainer();
        cleanup = result.cleanup;

        const Component = () => {
          selectedState = state<number | null>(0);
          const isSelected = selector(selectedState);

          return (
            <table>
              <tbody>
                {Array.from({ length: 1_000 }, (_, id) => (
                  <Row key={id} id={id} isSelected={isSelected} />
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
        selectedState = null;
        toggle = null;
      },
    }
  );
});
