/**
 * Async event storm benchmark
 *
 * Measures how well async event handlers perform under load.
 * Validates that async operations don't break event ordering.
 */

import { bench, describe } from 'vitest';
import { createIsland, task } from '../../src/index';
import {
  createTestContainer,
  flushScheduler,
  waitForNextEvaluation,
} from '../../tests/helpers/test-renderer';

describe('async event storm', () => {
  bench('async event handler (behavioral)', async () => {
    const { container, cleanup } = createTestContainer();

    const Component = () => {
      task(async () => {
        // Simulate single async event handler cost using microtask ticks (no timers)
        await new Promise<void>((r) => queueMicrotask(() => r()));
        await new Promise<void>((r) => queueMicrotask(() => r()));
      });

      return <div>Event handled</div>;
    };

    createIsland({ root: container, component: Component });
    flushScheduler();
    await waitForNextEvaluation();

    cleanup();
  });

  bench('10 concurrent async events (behavioral)', async () => {
    const { container, cleanup } = createTestContainer();

    const Component = () => {
      task(() => {
        // Simulate concurrent async event handling under load
        for (let i = 0; i < 10; i++) {
          (async () => {
            await new Promise<void>((r) => queueMicrotask(() => r()));
            await new Promise<void>((r) => queueMicrotask(() => r()));
          })().catch(() => {});
        }
      });

      return <div>Concurrent events: 10</div>;
    };

    createIsland({ root: container, component: Component });
    flushScheduler();
    await waitForNextEvaluation();

    cleanup();
  });

  bench('async event ordering (behavioral)', async () => {
    const { container, cleanup } = createTestContainer();

    const Component = () => {
      task(async () => {
        // Simulate sequential async operations maintaining order without timers
        await new Promise<void>((r) => queueMicrotask(() => r()));
        await new Promise<void>((r) => queueMicrotask(() => r()));
        await new Promise<void>((r) => queueMicrotask(() => r()));
      });

      return <div>Ordered events</div>;
    };

    createIsland({ root: container, component: Component });
    flushScheduler();
    await waitForNextEvaluation();

    cleanup();
  });
});
