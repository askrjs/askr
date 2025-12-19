import { describe, it, beforeAll, afterAll, expect } from 'vitest';
import { createApp, state } from '../../src/index';
import type { State } from '../../src/index';
import {
  createTestContainer,
  flushScheduler,
  waitForNextEvaluation,
} from '../helpers/test_renderer';

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

      createApp({ root: container, component: Component });
      flushScheduler();
      await waitForNextEvaluation();
    });

    it('should take the fast-path on large pathological reorder', async () => {
      // Rearrange: reverse and shuffle to ensure pathological movement
      items.set([...items()].reverse());
      flushScheduler();
      await waitForNextEvaluation();

      // The renderer emits trace stats for fast-path into globalThis
      const _g = globalThis as unknown as {
        __ASKR_LAST_FASTPATH_STATS?: { n?: number };
        __ASKR_LAST_FASTPATH_REUSED?: unknown;
        __ASKR_LAST_FASTPATH_COMMIT_COUNT?: number;
        __ASKR_LAST_FASTLANE_INVARIANTS?: {
          mountOps: number;
          cleanupFns: number;
        };
      };
      const stats = _g.__ASKR_LAST_FASTPATH_STATS;
      expect(stats).toBeDefined();
      expect(stats!.n).toBe(200);
      // Confirm reuse happened at least once
      expect(_g.__ASKR_LAST_FASTPATH_REUSED).toBeTruthy();

      // Dev-only invariants: exactly one DOM commit, no mounts or cleanup created
      const commitCount = _g.__ASKR_LAST_FASTPATH_COMMIT_COUNT;
      const inv = _g.__ASKR_LAST_FASTLANE_INVARIANTS;
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
              className: String(item.togg),
            },
            children: [item.text],
          })),
        };
      };

      createApp({ root: container, component: Component });
      flushScheduler();
      await waitForNextEvaluation();
    });

    it('should decline fast-path when props differ', async () => {
      // Reverse: but props (className) are constant until we change toggles
      items.set([...items()].reverse());
      flushScheduler();
      await waitForNextEvaluation();

      const _g = globalThis as unknown as {
        __ASKR_LAST_FASTPATH_STATS?: { n?: number };
      };
      const stats = _g.__ASKR_LAST_FASTPATH_STATS;
      // If the fast-path was taken, stats.n would equal 200; ensure it's undefined or from prior runs
      expect(stats == null || stats.n !== 200).toBeTruthy();
    });

    afterAll(() => cleanup());
  });
});
