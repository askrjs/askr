/**
 * Positional list reorder large-case benchmarks (clarified semantics)
 *
 * These are *transactional* benchmarks: each case performs several state
 * mutations that are intended to be coalesced into a single commit by the
 * scheduler. Heavy setup (large DOM creation and initial mount) is done in
 * `beforeAll` so the bench body only measures the batched state mutations and
 * the single scheduling flush.
 */

import { bench, describe, beforeAll, afterAll } from 'vitest';
import { createApp, state } from '../../src/index';
import type { State } from '../../src/index';
import {
  createTestContainer,
  flushScheduler,
  waitForNextEvaluation,
} from '../../tests/helpers/test_renderer';

describe('positional list reorder (large, transactional)', () => {
  // Removed intermediate large sizes (1k, 5k) to keep only the representative large-case (10k).
  // These intermediate sizes added noise without exposing distinct algorithmic paths.

  const POS10K = 10000;
  const POS10K_ITERS = 2;

  describe('10000 items - 2 batched state mutations (single commit, transactional)', () => {
    let container: HTMLElement;
    let cleanup: () => void;
    let items!: State<Array<string>>;

    beforeAll(async () => {
      const ctx = createTestContainer();
      container = ctx.container;
      cleanup = ctx.cleanup;

      const Component = () => {
        items = state(
          Array.from({ length: POS10K }, (_, i) => `Item ${i + 1}`)
        );
        return {
          type: 'ul',
          children: items().map((item) => ({ type: 'li', children: [item] })),
        };
      };

      createApp({ root: container, component: Component });
      flushScheduler();
      await waitForNextEvaluation();
    });

    bench(
      'framework::positional-reorder::10k::batched-state-mutations',
      async () => {
        for (let i = 0; i < POS10K_ITERS; i++)
          items.set([...items()].reverse());
        flushScheduler();
        await waitForNextEvaluation();
      }
    );

    afterAll(() => cleanup());
  });
});
