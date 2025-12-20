/**
 * Large tree 10k benchmark
 *
 * Measures performance with 10,000+ DOM nodes.
 * Validates scalability to large applications.
 */

import { bench, describe, beforeEach, afterEach } from 'vitest';
import { createApp, state } from '../../src/index';
import {
  createTestContainer,
  flushScheduler,
} from '../../tests/helpers/test_renderer';
import { benchN } from '../helpers/bench_config';

describe('large tree 10k', () => {
  bench('100x100 initial render (behavioral)', async () => {
    const { container, cleanup } = createTestContainer();

    const Component = () => {
      // Create a large tree with ~10k nodes
      const W = benchN(100);
      const H = benchN(100);

      const createLargeTree = () => {
        const children = [];
        for (let i = 0; i < W; i++) {
          const sectionChildren = [];
          for (let j = 0; j < H; j++) {
            sectionChildren.push({
              type: 'div',
              props: { 'data-id': `${i}-${j}` },
              children: [`Item ${i}-${j}`],
            });
          }
          children.push({
            type: 'section',
            children: sectionChildren,
          });
        }
        return { type: 'div', children };
      };

      return createLargeTree();
    };

    createApp({ root: container, component: Component });
    flushScheduler();
    await waitForNextEvaluation();

    cleanup();
  });

  describe('single update', () => {
    let container: HTMLElement;
    let cleanup: () => void;
    let updateSingle: (() => void) | null = null;

    beforeEach(() => {
      const res = createTestContainer();
      container = res.container;
      cleanup = res.cleanup;

      const Component = () => {
        const targetValue = state('initial');
        updateSingle = () =>
          targetValue.set(targetValue() === 'initial' ? 'updated' : 'initial');

        // Create a large tree with one dynamic value
        const children = [];
        const W = benchN(100);
        const H = benchN(100);

        for (let i = 0; i < W; i++) {
          const sectionChildren = [];
          for (let j = 0; j < H; j++) {
            const content =
              i === Math.floor(W / 2) && j === Math.floor(H / 2)
                ? targetValue()
                : `Item ${i}-${j}`;
            sectionChildren.push({
              type: 'div',
              props: { 'data-id': `${i}-${j}` },
              children: [content],
            });
          }
          children.push({
            type: 'section',
            children: sectionChildren,
          });
        }

        return { type: 'div', children };
      };

      createApp({ root: container, component: Component });
      flushScheduler();
      // pre-warm
      updateSingle!();
      flushScheduler();
    });

    afterEach(() => {
      cleanup();
      updateSingle = null;
    });

    bench('1 single update (state only)', () => {
      updateSingle!();
    });

    bench('1 single update (commit)', () => {
      updateSingle!();
      flushScheduler();
    });

    bench('1 single update (transactional)', async () => {
      updateSingle!();
      flushScheduler();
      await waitForNextEvaluation();
    });
  });

  describe('bulk updates', () => {
    let container: HTMLElement;
    let cleanup: () => void;
    let updateBulk: (() => void) | null = null;

    beforeEach(() => {
      const res = createTestContainer();
      container = res.container;
      cleanup = res.cleanup;

      const Component = () => {
        const updateCounter = state(0);
        updateBulk = () => updateCounter.set(updateCounter() + 1);

        // Create a large tree with many dynamic values
        const children = [];
        const W = benchN(50);
        const H = benchN(50);

        for (let i = 0; i < W; i++) {
          const sectionChildren = [];
          for (let j = 0; j < H; j++) {
            sectionChildren.push({
              type: 'div',
              props: { 'data-id': `${i}-${j}` },
              children: [`Item ${i}-${j}-${updateCounter()}`],
            });
          }
          children.push({
            type: 'section',
            children: sectionChildren,
          });
        }

        return { type: 'div', children };
      };

      createApp({ root: container, component: Component });
      flushScheduler();
      // pre-warm
      updateBulk!();
      flushScheduler();
    });

    afterEach(() => {
      cleanup();
      updateBulk = null;
    });

    bench('2500 bulk updates (state only)', () => {
      updateBulk!();
    });

    bench('2500 bulk updates (commit)', () => {
      updateBulk!();
      flushScheduler();
    });

    bench('2500 bulk updates (transactional)', async () => {
      updateBulk!();
      flushScheduler();
      await waitForNextEvaluation();
    });
  });
});
