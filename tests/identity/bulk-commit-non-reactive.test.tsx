import { describe, it, beforeAll, afterAll, expect } from 'vitest';
import { state } from '../../src/index';
import type { State } from '../../src/index';
import {
  createTestContainer,
  flushScheduler,
  waitForNextEvaluation,
} from '../helpers/test-renderer';
import { globalScheduler } from '../../src/runtime/scheduler';
import { createIsland } from '../helpers/create-island';

describe('bulk commit non-reactive invariants', () => {
  let container: HTMLElement;
  let cleanup: () => void;
  let items: State<number[]>;
  const N = 2000;

  beforeAll(() => {
    // Force positional bulk reuse to deterministically exercise the fast-path
    process.env.ASKR_FORCE_BULK_POSREUSE = '1';

    const ctx = createTestContainer();
    container = ctx.container;
    cleanup = ctx.cleanup;

    const Component = () => {
      items = state(Array.from({ length: N }, (_, i) => i));
      // No-op render counter attached to window scope for assertions
      globalThis.__BULK_RENDER_COUNT =
        (globalThis.__BULK_RENDER_COUNT || 0) + 1;
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

  it('should not schedule extra work during bulk commit', async () => {
    await waitForNextEvaluation();

    const beforeRenderCount = globalThis.__BULK_RENDER_COUNT!;
    const schedBefore = globalScheduler.getState().taskCount;

    // Trigger a bulk update; previously this could cause re-triggering loops
    try {
      items.set(items().map((x) => x + 1));
      flushScheduler();

      // Should complete and not schedule additional tasks
      await waitForNextEvaluation();
    } catch (err) {
      // Dump scheduler enqueue logs for debugging
      const ns =
        (
          globalThis as unknown as Record<string, unknown> & {
            __ASKR__?: Record<string, unknown>;
          }
        ).__ASKR__ || {};
      console.error('ENQUEUE LOGS (catch):', ns['__ENQUEUE_LOGS']);
      throw err;
    }

    const afterRenderCount = globalThis.__BULK_RENDER_COUNT!;

    // At least one re-render should have occurred (update applied)
    expect(afterRenderCount).toBeGreaterThan(beforeRenderCount);

    // Scheduler task count should eventually return to prior quiescent value
    // Poll a few ticks to allow microtasks/async scheduling to settle
    const maxTicks = 50;
    let quiesced = false;
    for (let i = 0; i < maxTicks; i++) {
      const s = globalScheduler.getState().taskCount;
      if (s === schedBefore) {
        quiesced = true;
        break;
      }
      // allow other microtasks to run

      await waitForNextEvaluation();
    }
    if (!quiesced) {
      // Dump enqueue logs for debugging

      const ns =
        (
          globalThis as unknown as Record<string, unknown> & {
            __ASKR__?: Record<string, unknown>;
          }
        ).__ASKR__ || {};
      console.error('ENQUEUE LOGS:', ns['__ENQUEUE_LOGS']);
      throw new Error(
        `Scheduler did not quiesce to expected count ${schedBefore}; last observed ${globalScheduler.getState().taskCount}`
      );
    }

    // Sanity: DOM length matches
    const afterEls = Array.from(container.querySelectorAll('li'));
    expect(afterEls.length).toBe(N);
  });

  afterAll(() => {
    cleanup();
    delete process.env.ASKR_FORCE_BULK_POSREUSE;
    delete globalThis.__BULK_RENDER_COUNT;
  });
});
