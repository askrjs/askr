import { bench, describe, expect } from 'vitest';
import { createIsland, state } from '../src';
import {
  createTestContainer,
  flushScheduler,
} from '../tests/helpers/test-renderer';
import { buildRows, tier1BenchOptions } from './_shared';

const initialItems = buildRows(200);
const reversedItems = initialItems.slice().reverse();

{
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
    itemsState.set(reversedItems);
    flushScheduler();
    expect(container.querySelector('[data-key="10"]')).toBe(preserved);
  } finally {
    cleanup();
  }
}

describe('tier1 renderer keyed fastpath', () => {
  let cleanup: (() => void) | null = null;
  let itemsState: ReturnType<typeof state<typeof initialItems>> | null = null;

  bench(
    'reorder a large keyed div list',
    () => {
      itemsState!.set(reversedItems);
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
      },
      teardown() {
        cleanup?.();
        cleanup = null;
        itemsState = null;
      },
    }
  );
});
