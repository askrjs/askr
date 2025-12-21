import { describe, it, beforeAll, afterAll, expect } from 'vitest';
import { createApp, state } from '../../src/index';
import type { State } from '../../src/index';
import {
  createTestContainer,
  flushScheduler,
  waitForNextEvaluation,
} from '../helpers/test_renderer';

describe('bulk text fast-path (unkeyed)', () => {
  let container: HTMLElement;
  let cleanup: () => void;
  let items: State<number[]>;

  beforeAll(() => {
    // Force low threshold so test runs quickly
    process.env.ASKR_BULK_TEXT_THRESHOLD = '10';

    const ctx = createTestContainer();
    container = ctx.container;
    cleanup = ctx.cleanup;

    const Component = () => {
      items = state(Array.from({ length: 20 }, (_, i) => i));
      return {
        type: 'ul',
        children: items().map((item: number) => ({
          type: 'li',
          children: ['Item ' + item],
        })),
      };
    };

    createApp({ root: container, component: Component });
    flushScheduler();
  });

  it('should take bulk text fast-path and preserve identity/listeners', async () => {
    await waitForNextEvaluation();

    const beforeEls = Array.from(container.querySelectorAll('li'));
    expect(beforeEls.length).toBe(20);

    // Attach a listener to first item
    let clickCount = 0;
    beforeEls[0].addEventListener('click', () => {
      clickCount++;
    });

    // Perform bulk update
    items.set(items().map((x: number) => x + 1));
    flushScheduler();
    await waitForNextEvaluation();

    // Assert fast-path stats set
    const _g = globalThis as unknown as {
      __ASKR_LAST_BULK_TEXT_FASTPATH_STATS?: { n?: number; reused?: number };
      __ASKR_FASTPATH_COUNTERS?: Record<string, number>;
    };

    expect(_g.__ASKR_LAST_BULK_TEXT_FASTPATH_STATS).toBeDefined();
    expect(_g.__ASKR_LAST_BULK_TEXT_FASTPATH_STATS!.n).toBe(20);

    const afterEls = Array.from(container.querySelectorAll('li'));
    // Identity preserved
    for (let i = 0; i < beforeEls.length; i++) {
      expect(afterEls[i]).toBe(beforeEls[i]);
    }

    // Listener preserved (dispatch click)
    afterEls[0].dispatchEvent(new Event('click'));
    expect(clickCount).toBe(1);
  });

  afterAll(() => {
    cleanup();
    // restore threshold
    delete process.env.ASKR_BULK_TEXT_THRESHOLD;
  });
});
