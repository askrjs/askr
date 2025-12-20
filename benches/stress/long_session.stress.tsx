/**
 * Long session benchmark
 *
 * Measures performance stability over extended application lifetime.
 * Validates no memory leaks or performance degradation.
 */

import { bench, describe, beforeEach, afterEach } from 'vitest';
import { createApp, state } from '../../src/index';
import {
  createTestContainer,
  flushScheduler,
  waitForNextEvaluation,
} from '../../tests/helpers/test_renderer';
import { benchN, benchIterations } from '../helpers/bench_config';

describe('long session', () => {
  describe('1000 extended operations', () => {
    let container: HTMLElement;
    let cleanup: () => void;
    let performOperation: (() => void) | null = null;

    beforeEach(() => {
      const res = createTestContainer();
      container = res.container;
      cleanup = res.cleanup;

      const Component = () => {
        const sessionCount = state(0);
        performOperation = () => sessionCount.set(sessionCount() + 1);

        return {
          type: 'div',
          children: [`Session operations: ${sessionCount()}`],
        };
      };

      createApp({ root: container, component: Component });
      flushScheduler();
      // pre-warm
      performOperation!();
      flushScheduler();
    });

    afterEach(() => {
      cleanup();
      performOperation = null;
    });

    bench('1000 extended operations (state only)', () => {
      for (let i = 0; i < 1000; i++) {
        performOperation!();
      }
    });

    bench('1000 extended operations (commit)', () => {
      for (let i = 0; i < 1000; i++) {
        performOperation!();
      }
      flushScheduler();
    });

    bench('1000 extended operations (transactional)', async () => {
      for (let i = 0; i < 1000; i++) {
        performOperation!();
      }
      flushScheduler();
      await waitForNextEvaluation();
    });
  });

  describe('100 component instances', () => {
    let container: HTMLElement;
    let cleanup: () => void;
    let updateInstances: (() => void) | null = null;

    const INSTANCES = benchN(100);
    const INNER = benchN(1000);

    beforeEach(() => {
      const res = createTestContainer();
      container = res.container;
      cleanup = res.cleanup;

      const Component = () => {
        const instanceCount = state(0);
        updateInstances = () => instanceCount.set(instanceCount() + 1);

        const children = [];
        for (let i = 0; i < INSTANCES; i++) {
          const data = state(new Array(INNER).fill(i));
          children.push({
            type: 'div',
            children: [`Component ${i} (data:${data().length})`],
          });
        }

        return { type: 'div', children };
      };

      createApp({ root: container, component: Component });
      flushScheduler();
      // pre-warm
      updateInstances!();
      flushScheduler();
    });

    afterEach(() => {
      cleanup();
      updateInstances = null;
    });

    bench('100 component instances (state only)', () => {
      updateInstances!();
    });

    bench('100 component instances (commit)', () => {
      updateInstances!();
      flushScheduler();
    });

    bench('100 component instances (transactional)', async () => {
      updateInstances!();
      flushScheduler();
      await waitForNextEvaluation();
    });
  });

  const GC_SIZE = benchN(10000);
  const GC_ITERS = benchIterations(10000);

  describe('10000 gc pressure cycles', () => {
    let container: HTMLElement;
    let cleanup: () => void;
    let updateData: (() => void) | null = null;

    beforeEach(() => {
      const res = createTestContainer();
      container = res.container;
      cleanup = res.cleanup;

      const Component = () => {
        const largeData = state(new Array(GC_SIZE).fill(0));
        const metadata = state({ timestamp: 0, id: 0 });

        updateData = () => {
          largeData.set(new Array(GC_SIZE).fill(largeData()[0] + 1));
          metadata.set({
            timestamp: metadata().timestamp + 1,
            id: metadata().id + 1,
          });
        };

        return {
          type: 'div',
          children: [`GC Cycles: ${metadata().timestamp}`],
        };
      };

      createApp({ root: container, component: Component });
      flushScheduler();
      // pre-warm
      updateData!();
      flushScheduler();
    });
    afterEach(() => {
      cleanup();
      updateData = null;
    });

    bench('10000 gc pressure cycles (state only)', () => {
      for (let i = 0; i < GC_ITERS; i++) {
        updateData!();
      }
    });

    bench('10000 gc pressure cycles (commit)', () => {
      for (let i = 0; i < GC_ITERS; i++) {
        updateData!();
      }
      flushScheduler();
    });

    bench('10000 gc pressure cycles (transactional)', async () => {
      for (let i = 0; i < GC_ITERS; i++) {
        updateData!();
      }
      flushScheduler();
      await waitForNextEvaluation();
    });
  });
});
