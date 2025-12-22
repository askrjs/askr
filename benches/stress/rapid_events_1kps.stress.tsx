/**
 * Rapid events 1kps benchmark
 *
 * Measures performance under 1000 events per second load.
 * Validates event handling doesn't degrade over time.
 */

import { bench, describe, beforeEach, afterEach } from 'vitest';
import { createIsland, state } from '../../src/index';
import {
  createTestContainer,
  flushScheduler,
  waitForNextEvaluation,
} from '../../tests/helpers/test_renderer';

describe('rapid events 1kps', () => {
  describe('1000 sustained events', () => {
    let container: HTMLElement;
    let cleanup: () => void;
    let handleClick: (() => void) | null = null;

    beforeEach(() => {
      const res = createTestContainer();
      container = res.container;
      cleanup = res.cleanup;

      const Component = () => {
        const clickCount = state(0);
        handleClick = () => clickCount.set(clickCount() + 1);

        return {
          type: 'div',
          children: [`Clicks: ${clickCount()}`],
        };
      };

      createIsland({ root: container, component: Component });
      flushScheduler();
      // pre-warm
      handleClick!();
      flushScheduler();
    });

    afterEach(() => {
      cleanup();
      handleClick = null;
    });

    const SUSTAINED = 1000;

    bench('1000 sustained events (state only)', () => {
      for (let i = 0; i < SUSTAINED; i++) {
        handleClick!();
      }
    });

    bench('1000 sustained events (commit)', () => {
      for (let i = 0; i < SUSTAINED; i++) {
        handleClick!();
      }
      flushScheduler();
    });

    bench('1000 sustained events (transactional)', async () => {
      for (let i = 0; i < SUSTAINED; i++) {
        handleClick!();
      }
      flushScheduler();
      await waitForNextEvaluation();
    });
  });

  describe('100 event bursts', () => {
    let container: HTMLElement;
    let cleanup: () => void;
    let handleBurstClick: (() => void) | null = null;

    beforeEach(() => {
      const res = createTestContainer();
      container = res.container;
      cleanup = res.cleanup;

      const Component = () => {
        const burstCount = state(0);
        handleBurstClick = () => burstCount.set(burstCount() + 1);

        return {
          type: 'div',
          children: [`Burst clicks: ${burstCount()}`],
        };
      };

      createIsland({ root: container, component: Component });
      flushScheduler();
      // pre-burst
      for (let i = 0; i < 10; i++) handleBurstClick!();
      flushScheduler();
    });

    afterEach(() => {
      cleanup();
      handleBurstClick = null;
    });

    bench('100 event bursts (state only)', () => {
      for (let i = 0; i < 100; i++) handleBurstClick!();
    });

    bench('100 event bursts (commit)', () => {
      for (let i = 0; i < 100; i++) handleBurstClick!();
      flushScheduler();
    });

    bench('100 event bursts (transactional)', async () => {
      for (let i = 0; i < 100; i++) handleBurstClick!();
      flushScheduler();
      await waitForNextEvaluation();
    });
  });

  describe('1000 memory stability events', () => {
    let container: HTMLElement;
    let cleanup: () => void;
    let handleMemoryClick: (() => void) | null = null;

    beforeEach(() => {
      const res = createTestContainer();
      container = res.container;
      cleanup = res.cleanup;

      const Component = () => {
        const memoryCount = state(0);
        handleMemoryClick = () => memoryCount.set(memoryCount() + 1);

        return {
          type: 'div',
          children: [`Memory clicks: ${memoryCount()}`],
        };
      };

      createIsland({ root: container, component: Component });
      flushScheduler();
      // pre-warm
      handleMemoryClick!();
      flushScheduler();
    });

    afterEach(() => {
      cleanup();
      handleMemoryClick = null;
    });

    bench('1000 memory stability events (state only)', () => {
      for (let i = 0; i < 1000; i++) {
        handleMemoryClick!();
      }
    });

    bench('1000 memory stability events (commit)', () => {
      for (let i = 0; i < 1000; i++) {
        handleMemoryClick!();
      }
      flushScheduler();
    });

    bench('1000 memory stability events (transactional)', async () => {
      for (let i = 0; i < 1000; i++) {
        handleMemoryClick!();
      }
      flushScheduler();
      await waitForNextEvaluation();
    });
  });
});
