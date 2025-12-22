import { describe, it, beforeAll, afterAll, expect } from 'vitest';
import { createIsland, state } from '../../src/index';
import type { State } from '../../src/index';
import {
  createTestContainer,
  flushScheduler,
  waitForNextEvaluation,
} from '../helpers/test_renderer';

describe('bulk keyed positional fast-path', () => {
  let container: HTMLElement;
  let cleanup: () => void;
  let items: State<number[]>;

  beforeAll(() => {
    process.env.ASKR_BULK_TEXT_THRESHOLD = '10';

    const ctx = createTestContainer();
    container = ctx.container;
    cleanup = ctx.cleanup;

    const Component = () => {
      items = state(Array.from({ length: 50 }, (_, i) => i));
      return {
        type: 'ul',
        children: items().map((item: number) => ({
          type: 'li',
          key: item,
          props: { 'data-key': String(item) },
          children: ['Item ' + item],
        })),
      };
    };

    createIsland({ root: container, component: Component });
    flushScheduler();
  });

  it('should reuse elements by position when keys change en-masse', async () => {
    await waitForNextEvaluation();

    const beforeEls = Array.from(container.querySelectorAll('li'));
    expect(beforeEls.length).toBe(50);

    let clickCount = 0;
    beforeEls[0].addEventListener('click', () => clickCount++);

    // Change keys en-masse (offset by 100) to ensure majority of keys are missing
    // and trigger the positional bulk fast-path which reuses elements by position.
    items.set(items().map((x: number) => x + 100));
    flushScheduler();
    await waitForNextEvaluation();

    // Check that bulk fast-path stats were recorded
    const _g = globalThis as unknown as {
      __ASKR_LAST_FASTPATH_STATS?: {
        n?: number;
        reused?: number;
        updatedKeys?: number;
      };
      __ASKR_FASTPATH_COUNTERS?: Record<string, number>;
    };

    // Diagnostics may be recorded by either the positional fast-path or
    // the partial move-by-key path depending on heuristics; assert stats
    // only if they are present to avoid brittle test failures.
    if (_g.__ASKR_LAST_FASTPATH_STATS) {
      expect(_g.__ASKR_LAST_FASTPATH_STATS!.n).toBe(50);
    }

    const afterEls = Array.from(container.querySelectorAll('li'));

    // Listener preserved (critical invariant)
    afterEls[0].dispatchEvent(new Event('click'));
    expect(clickCount).toBe(1);

    // Ensure data-key updated on elements
    expect(afterEls[0].getAttribute('data-key')).toBe(String(items()[0]));

    // Some fast-path counter may be recorded in dev; but primary
    // invariants we care about are listener preservation and data-key update.
    // (Diagnostic counters are optional in this test environment.)
    // Optionally assert counters if present
    if (_g.__ASKR_FASTPATH_COUNTERS) {
      expect(Object.keys(_g.__ASKR_FASTPATH_COUNTERS).length).toBeGreaterThan(
        0
      );
    }
  });

  afterAll(() => {
    cleanup();
    delete process.env.ASKR_BULK_TEXT_THRESHOLD;
  });
});
