/**
 * Tier: Framework / Transactional
 * Includes: state mutation, scheduler enqueue/flush, component render, reconciliation, commit
 * Excludes: stand-alone DOM-only measurements (see Tier A dom benches)
 *
 * This file measures "batched state mutations → single commit" behavior.
 */

import { bench, describe, beforeAll, afterAll } from 'vitest';
import { createIsland, state } from '../../src/index';
import type { State } from '../../src/index';
import {
  createTestContainer,
  flushScheduler,
  waitForNextEvaluation,
} from '../../tests/helpers/test_renderer';

describe('positional list reorder (transactional)', () => {
  describe('5 items - 100 batched state mutations (single commit, transactional)', () => {
    let container: HTMLElement;
    let cleanup: () => void;
    let items!: State<Array<string>>;

    beforeAll(async () => {
      const ctx = createTestContainer();
      container = ctx.container;
      cleanup = ctx.cleanup;

      const Component = () => {
        items = state(['First', 'Second', 'Third', 'Fourth', 'Fifth']);
        return {
          type: 'ul',
          children: items().map((item) => ({ type: 'li', children: [item] })),
        };
      };

      createIsland({ root: container, component: Component });
      flushScheduler();
      await waitForNextEvaluation();
    });

    bench(
      'framework::positional-reorder::5::batched-state-mutations',
      async () => {
        // Hot path: perform multiple state mutations which should be coalesced
        for (let i = 0; i < 100; i++) items.set([...items()].reverse());
        flushScheduler();
        await waitForNextEvaluation();
      }
    );

    afterAll(() => cleanup());
  });

  describe('100 items - 100 batched state mutations (single commit, transactional)', () => {
    let container: HTMLElement;
    let cleanup: () => void;
    let items!: State<Array<string>>;

    beforeAll(async () => {
      const ctx = createTestContainer();
      container = ctx.container;
      cleanup = ctx.cleanup;

      const Component = () => {
        items = state(Array.from({ length: 100 }, (_, i) => `Item ${i + 1}`));
        return {
          type: 'ul',
          children: items().map((item) => ({ type: 'li', children: [item] })),
        };
      };

      createIsland({ root: container, component: Component });
      flushScheduler();
      await waitForNextEvaluation();
    });

    bench(
      'framework::positional-reorder::100::batched-state-mutations',
      async () => {
        for (let i = 0; i < 100; i++) items.set([...items()].reverse());
        flushScheduler();
        await waitForNextEvaluation();
      }
    );

    afterAll(() => cleanup());
  });

  describe('identity-loss scenario - 4 items - 100 batched state mutations (single commit, transactional)', () => {
    let container: HTMLElement;
    let cleanup: () => void;
    let items!: State<Array<{ text: string; internal: number }>>;

    beforeAll(async () => {
      const ctx = createTestContainer();
      container = ctx.container;
      cleanup = ctx.cleanup;

      const Component = () => {
        items = state([
          { text: 'Alpha', internal: 0.1 },
          { text: 'Beta', internal: 0.2 },
          { text: 'Gamma', internal: 0.3 },
          { text: 'Delta', internal: 0.4 },
        ]);
        return {
          type: 'ul',
          children: items().map((item) => ({
            type: 'li',
            children: [`${item.text} (${item.internal.toFixed(2)})`],
          })),
        };
      };

      createIsland({ root: container, component: Component });
      flushScheduler();
      await waitForNextEvaluation();
    });

    bench(
      'framework::positional-reorder::4::batched-state-mutations',
      async () => {
        for (let i = 0; i < 100; i++) {
          items.set([items()[3], items()[1], items()[0], items()[2]]);
        }
        flushScheduler();
        await waitForNextEvaluation();
      }
    );

    afterAll(() => cleanup());
  });
});
