import { describe, it, beforeAll, afterAll, expect } from 'vitest';
import { createIsland, state } from '../../src/index';
import type { State } from '../../src/index';
import {
  createTestContainer,
  flushScheduler,
  waitForNextEvaluation,
} from '../helpers/test-renderer';
import { globalScheduler } from '../../src/runtime/scheduler';

/*
 Consolidated fast-lane tests
 - fastlane.test.ts (runtime fast-lane behavior)
 - fastlane_large_reorder_regression.test.ts (large reorder hang regression)
 - fastlane_scheduler_progress.test.ts (scheduler progress escape during fast-lane)
*/

describe('runtime fast-lane', () => {
  describe('activates for large keyed reorders', () => {
    let container: HTMLElement;
    let cleanup: () => void;
    let items!: State<Array<{ id: number; text: string }>>;

    beforeAll(async () => {
      const ctx = createTestContainer();
      container = ctx.container;
      cleanup = ctx.cleanup;

      const Component = () => {
        items = state(
          Array.from({ length: 200 }, (_, i) => ({
            id: i + 1,
            text: `Item ${i + 1}`,
          }))
        );
        return {
          type: 'ul',
          children: items().map((item) => ({
            type: 'li',
            key: item.id,
            props: { 'data-key': String(item.id) },
            children: [item.text],
          })),
        };
      };

      createIsland({ root: container, component: Component });
      flushScheduler();
      await waitForNextEvaluation();
    });

    it('should take the fast-path on large pathological reorder', async () => {
      // Rearrange: reverse and shuffle to ensure pathological movement
      items.set([...items()].reverse());
      flushScheduler();
      await waitForNextEvaluation();

      const ns =
        (
          globalThis as unknown as Record<string, unknown> & {
            __ASKR__?: Record<string, unknown>;
          }
        ).__ASKR__ || {};
      type FastpathStats = {
        n?: number;
        reused?: number;
        reusedCount?: number;
      };
      const stats =
        (ns['__LAST_FASTPATH_STATS'] as FastpathStats) ??
        (ns['__LAST_FASTPATH_HISTORY'] as FastpathStats[] | undefined)?.slice(
          -1
        )[0];
      expect(stats).toBeDefined();
      expect((stats as FastpathStats).n).toBe(200);

      const last =
        (ns['__LAST_FASTPATH_HISTORY'] as FastpathStats[] | undefined)?.slice(
          -1
        )[0] ?? (ns['__LAST_FASTPATH_STATS'] as FastpathStats);

      // Prefer explicit, typed checks instead of `any` to satisfy test-suite guidelines
      let reusedObserved = false;
      if (last) {
        if (
          typeof (last as { reusedCount?: unknown }).reusedCount === 'number'
        ) {
          reusedObserved = true;
        } else if (typeof (last as { reused?: unknown }).reused === 'number') {
          reusedObserved = true;
        }
      }
      if (!reusedObserved && ns['__LAST_FASTPATH_REUSED'])
        reusedObserved = true;
      expect(reusedObserved).toBeTruthy();

      const commitCount = ns['__LAST_FASTPATH_COMMIT_COUNT'] as
        | number
        | undefined;
      const inv = ns['__LAST_FASTLANE_INVARIANTS'] as
        | { mountOps?: number; cleanupFns?: number }
        | undefined;
      expect(commitCount).toBe(1);
      expect(inv).toBeDefined();
      expect(inv!.mountOps).toBe(0);
      expect(inv!.cleanupFns).toBe(0);
    });

    afterAll(() => cleanup());
  });

  describe('does not activate when props change', () => {
    let container: HTMLElement;
    let cleanup: () => void;
    let items!: State<Array<{ id: number; text: string; togg: number }>>;

    beforeAll(async () => {
      const ctx = createTestContainer();
      container = ctx.container;
      cleanup = ctx.cleanup;

      const Component = () => {
        items = state(
          Array.from({ length: 200 }, (_, i) => ({
            id: i + 1,
            text: `Item ${i + 1}`,
            togg: i % 2,
          }))
        );
        return {
          type: 'ul',
          children: items().map((item) => ({
            type: 'li',
            key: item.id,
            props: {
              'data-key': String(item.id),
              class: String(item.togg),
            },
            children: [item.text],
          })),
        };
      };

      createIsland({ root: container, component: Component });
      flushScheduler();
      await waitForNextEvaluation();
    });

    it('should decline fast-path when props differ', async () => {
      items.set([...items()].reverse());
      flushScheduler();
      await waitForNextEvaluation();

      const ns =
        (
          globalThis as unknown as Record<string, unknown> & {
            __ASKR__?: Record<string, unknown>;
          }
        ).__ASKR__ || {};
      type FastpathStats = { n?: number } | undefined;
      const stats = ns['__LAST_FASTPATH_STATS'] as FastpathStats;
      expect(stats == null || stats.n !== 200).toBeTruthy();
    });

    afterAll(() => cleanup());
  });
});

// Large reorder regression test: ensure no hang
describe('fast-lane large reorder regression', () => {
  let container: HTMLElement;
  let cleanup: () => void;
  let items: State<number[]>;
  const N = 2000; // large enough to reproduce previous hang but small enough for CI

  beforeAll(() => {
    process.env.ASKR_FORCE_BULK_POSREUSE = '1';

    const ctx = createTestContainer();
    container = ctx.container;
    cleanup = ctx.cleanup;

    const Component = () => {
      items = state(Array.from({ length: N }, (_, i) => i));
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

  it('should complete large fast-lane reorder without hanging', async () => {
    await waitForNextEvaluation();

    // Perform large keys-shift which previously could cause a hang
    items.set(items().map((x: number) => x + 1));
    flushScheduler();

    await waitForNextEvaluation();

    const afterEls = Array.from(container.querySelectorAll('li'));
    expect(afterEls.length).toBe(N);

    const ns =
      (
        globalThis as unknown as Record<string, unknown> & {
          __ASKR__?: Record<string, unknown>;
        }
      ).__ASKR__ || {};
    if (ns['__LAST_FASTPATH_STATS']) {
      const _stats = ns['__LAST_FASTPATH_STATS'] as { n?: number };
      expect(_stats.n).toBe(N);
    }
  });

  afterAll(() => {
    cleanup();
    delete process.env.ASKR_FORCE_BULK_POSREUSE;
  });
});

// Scheduler progress escape hatch test
describe('fast-lane scheduler progress escape hatch', () => {
  let container: HTMLElement;
  let cleanup: () => void;
  let items: State<Array<{ id: number; text: string }>>;

  beforeAll(() => {
    const ctx = createTestContainer();
    container = ctx.container;
    cleanup = ctx.cleanup;
  });

  it('should allow synchronous scheduler progress during fast-lane commit', async () => {
    let marker = false;

    const Component = () => {
      items = state(
        Array.from({ length: 200 }, (_, i) => ({
          id: i + 1,
          text: `Item ${i + 1}`,
        }))
      );

      globalScheduler.enqueue(() => {
        marker = true;
      });

      return {
        type: 'ul',
        children: items().map((item: { id: number; text: string }) => ({
          type: 'li',
          key: item.id,
          props: { 'data-key': String(item.id) },
          children: [item.text],
        })),
      };
    };

    createIsland({ root: container, component: Component });
    flushScheduler();
    await waitForNextEvaluation();

    // Trigger a pathological reorder to exercise the fast-lane path
    items.set([...items()].reverse());

    // flush and await completion; previously this would hang
    flushScheduler();
    await waitForNextEvaluation();

    // The enqueued task should have executed synchronously during the fast-lane
    expect(marker).toBeTruthy();

    cleanup();
  });
});
