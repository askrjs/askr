/**
 * NOTE: Mixed-tier file
 * - Contains Tier A (dom) reconcile-only microbenchmarks (replacefragment)
 * - Contains Tier B (framework) transactional benchmarks (batched state mutations)
 *
 * Purpose: keep related scenarios together while keeping each bench's tier
 * explicit and self-describing (see individual describe blocks below).
 */

import { bench, describe, beforeAll, afterAll } from 'vitest';
import { createIsland, state } from '../../src/index';
import type { State } from '../../src/index';
import {
  createTestContainer,
  flushScheduler,
  waitForNextEvaluation,
} from '../../tests/helpers/test-renderer';

describe('keyed list reorder (large)', () => {
  // Removed reconcile-only pure-DOM microbenches (replacefragment) — these do not exercise Askr internals and were noisy.

  describe('transactional benchmarks (batched state mutations → single commit)', () => {
    // Removed intermediate large transactional sizes (1k, 5k) to keep only the representative large-case (10k).
    // Also removed duplicate 'reorder-only-fastlane' which duplicated the 10k measurement.

    const ITEMS_10K = 10000;
    const ITER_10K = 1;

    describe('10000 items - 1 batched state mutation (single commit, transactional)', () => {
      let container: HTMLElement;
      let cleanup: () => void;
      let items!: State<Array<{ id: number; text: string }>>;

      beforeAll(async () => {
        const ctx = createTestContainer();
        container = ctx.container;
        cleanup = ctx.cleanup;

        const Component = () => {
          items = state(
            Array.from({ length: ITEMS_10K }, (_, i) => ({
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

      bench(
        'framework::keyed-reorder::10k::batched-state-mutations',
        async () => {
          for (let i = 0; i < ITER_10K; i++) items.set([...items()].reverse());
          flushScheduler();
          await waitForNextEvaluation();
        }
      );

      afterAll(() => cleanup());
    });
  });
});
