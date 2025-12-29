import { afterAll, beforeAll, bench, describe } from 'vitest';
import { createIsland, state } from '../../src';
import type { State } from '../../src';
import {
  createTestContainer,
  flushScheduler,
} from '../../tests/helpers/test-renderer';

function setup(disableFastlane: boolean) {
  const ctx = createTestContainer();
  const container = ctx.container;

  const origFastlane = (globalThis as unknown as Record<string, unknown>)
    .__ASKR_FASTLANE;
  if (disableFastlane) {
    try {
      delete (globalThis as unknown as Record<string, unknown>).__ASKR_FASTLANE;
    } catch {
      /* ignore */
    }
  }

  let items!: State<Array<{ id: number; text: string }>>;

  const Component = () => {
    const N = 10000;
    items = state(
      Array.from({ length: N }, (_, i) => ({
        id: i + 1,
        text: `Item ${i + 1}`,
      }))
    );
    return {
      type: 'ul',
      children: items().map((item) => ({
        type: 'li',
        key: item.id,
        children: [item.text],
      })),
    };
  };

  createIsland({ root: container, component: Component });
  flushScheduler();

  return {
    ctx,
    items,
    restore() {
      if (disableFastlane) {
        (globalThis as unknown as Record<string, unknown>).__ASKR_FASTLANE =
          origFastlane;
      }
      ctx.cleanup();
    },
  };
}

describe('framework::keyed-reorder::10k::statistical', () => {
  describe('fastlane-enabled', () => {
    let items: State<Array<{ id: number; text: string }>>;
    let restore: () => void;

    beforeAll(() => {
      const s = setup(false);
      items = s.items;
      restore = s.restore;
      flushScheduler();

      // one-time warm-up
      items.set([...items()].reverse());
      flushScheduler();
    });

    afterAll(() => restore());

    bench(
      'fastlane-enabled',
      () => {
        // measured operation only
        items.set([...items()].reverse());
        flushScheduler();
      },
      {
        iterations: 5,
        warmupIterations: 0,
      }
    );
  });

  describe('fastlane-disabled', () => {
    let items: State<Array<{ id: number; text: string }>>;
    let restore: () => void;

    beforeAll(() => {
      const s = setup(true);
      items = s.items;
      restore = s.restore;
      flushScheduler();

      // one-time warm-up
      items.set([...items()].reverse());
      flushScheduler();
    });

    afterAll(() => restore());

    bench(
      'fastlane-disabled',
      () => {
        // measured operation only
        items.set([...items()].reverse());
        flushScheduler();
      },
      {
        iterations: 5,
        warmupIterations: 0,
      }
    );
  });
});
