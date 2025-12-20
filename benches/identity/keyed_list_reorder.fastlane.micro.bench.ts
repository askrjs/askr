import { afterAll, beforeAll, bench, describe } from 'vitest';
import { createApp, state } from '../../src/index';
import type { State } from '../../src/index';
import {
  createTestContainer,
  flushScheduler,
  waitForNextEvaluation,
} from '../../tests/helpers/test_renderer';

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

  createApp({ root: container, component: Component });
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

    beforeAll(async () => {
      const s = setup(false);
      items = s.items;
      restore = s.restore;
      await waitForNextEvaluation();

      // one-time warm-up
      items.set([...items()].reverse());
      flushScheduler();
      await waitForNextEvaluation();
    });

    afterAll(() => restore());

    bench(
      'fastlane-enabled',
      async () => {
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

    beforeAll(async () => {
      const s = setup(true);
      items = s.items;
      restore = s.restore;
      await waitForNextEvaluation();

      // one-time warm-up
      items.set([...items()].reverse());
      flushScheduler();
      await waitForNextEvaluation();
    });

    afterAll(() => restore());

    bench(
      'fastlane-disabled',
      async () => {
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
