import { bench, describe, expect } from 'vite-plus/test';
import { createIsland, state } from '../../../src';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';
import type { BenchToggle, RowData } from '../../shared/_shared';
import {
  assertToggleMutationGuard,
  buildRows,
  createRowToggle,
  tier1BenchOptions,
  verifyTier1Invariant,
} from '../../shared/_shared';

const initialItems = buildRows(200);
const reversedItems = initialItems.slice().reverse();

verifyTier1Invariant('tier1 hotpath renderer keyed fastpath', () => {
  const { container, cleanup } = createTestContainer();
  let itemsState!: ReturnType<typeof state<typeof initialItems>>;

  const Component = () => {
    itemsState = state(initialItems);
    return (
      <div>
        {itemsState().map((item) => (
          <div key={item.id} data-key={String(item.id)}>
            {item.label}
          </div>
        ))}
      </div>
    );
  };

  try {
    createIsland({ root: container, component: Component });
    flushScheduler();
    const preserved = container.querySelector('[data-key="10"]');
    const toggle = createRowToggle(initialItems, reversedItems, 'initial');

    assertToggleMutationGuard(
      container,
      () => {
        itemsState.set(toggle.next() as RowData[]);
        flushScheduler();
      },
      () => {
        itemsState.set(toggle.next() as RowData[]);
        flushScheduler();
      },
      {
        label: 'tier1 renderer keyed fastpath',
        afterForward: () => {
          expect(container.querySelector('[data-key="10"]')).toBe(preserved);
          expect(
            container.firstElementChild?.firstElementChild?.textContent
          ).toBe('Item 200');
        },
        afterBackward: () => {
          expect(container.querySelector('[data-key="10"]')).toBe(preserved);
          expect(
            container.firstElementChild?.firstElementChild?.textContent
          ).toBe('Item 1');
        },
      }
    );
  } finally {
    cleanup();
  }
});

describe('tier1 renderer keyed fastpath', () => {
  let cleanup: (() => void) | null = null;
  let itemsState: ReturnType<typeof state<typeof initialItems>> | null = null;
  let toggle: BenchToggle<readonly RowData[]> | null = null;

  bench(
    'reorder a large keyed div list',
    () => {
      itemsState!.set(toggle!.next() as RowData[]);
      flushScheduler();
    },
    {
      ...tier1BenchOptions,
      setup() {
        const result = createTestContainer();
        cleanup = result.cleanup;

        const Component = () => {
          itemsState = state(initialItems);
          return (
            <div>
              {itemsState().map((item) => (
                <div key={item.id} data-key={String(item.id)}>
                  {item.label}
                </div>
              ))}
            </div>
          );
        };

        createIsland({ root: result.container, component: Component });
        flushScheduler();
        toggle = createRowToggle(initialItems, reversedItems, 'initial');
      },
      teardown() {
        cleanup?.();
        cleanup = null;
        itemsState = null;
        toggle = null;
      },
    }
  );
});
