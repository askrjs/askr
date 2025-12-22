/**
 * Abort pressure benchmark
 *
 * Measures the cost of aborting in-flight async operations.
 * Validates that cancellation is efficient and isolated.
 */

import { bench, describe } from 'vitest';
import { createIsland, state, task } from '../../src/index';
import {
  createTestContainer,
  flushScheduler,
  waitForNextEvaluation,
} from '../../tests/helpers/test_renderer';

describe('abort pressure', () => {
  bench('single abort (behavioral)', async () => {
    const { container, cleanup } = createTestContainer();

    const Component = () => {
      const status = state<'pending' | 'completed' | 'aborted'>('pending');

      task(() => {
        const controller = new AbortController();

        // Start async work without blocking task completion
        const promise = (async () => {
          // Wait a few microtask ticks unless aborted
          for (let i = 0; i < 5; i++) {
            if (controller.signal.aborted) throw new Error('aborted');
            await new Promise<void>((r) => queueMicrotask(() => r()));
          }
        })();

        promise
          .then(() => status.set('completed'))
          .catch(() => status.set('aborted'));

        // Cleanup aborts in-flight operation
        return () => controller.abort();
      });

      return <div>Status: {status()}</div>;
    };

    createIsland({ root: container, component: Component });
    flushScheduler();
    await waitForNextEvaluation();

    // Dispose triggers abort of in-flight async work
    cleanup();
  });

  bench('5 concurrent aborts (behavioral)', async () => {
    const { container, cleanup } = createTestContainer();

    const Component = () => {
      const statuses = state<string[]>(Array(5).fill('pending'));

      task(() => {
        const controllers: AbortController[] = [];

        // Start multiple concurrent async operations
        Array.from({ length: 5 }, (_, i) => {
          const controller = new AbortController();
          controllers.push(controller);

          const promise = (async () => {
            for (let t = 0; t < 3; t++) {
              if (controller.signal.aborted) throw new Error('aborted');
              await new Promise<void>((r) => queueMicrotask(() => r()));
            }
          })();

          promise
            .then(() => {
              const next = [...statuses()];
              next[i] = 'completed';
              statuses.set(next);
            })
            .catch(() => {
              const next = [...statuses()];
              next[i] = 'aborted';
              statuses.set(next);
            });
        });

        // Cleanup aborts all in-flight operations
        return () => controllers.forEach((c) => c.abort());
      });

      return <div>Statuses: {statuses().join(', ')}</div>;
    };

    createIsland({ root: container, component: Component });
    flushScheduler();
    await waitForNextEvaluation();

    // Dispose triggers abort of all in-flight async work
    cleanup();
  });

  bench('100 abort storm (behavioral)', async () => {
    const { container, cleanup } = createTestContainer();

    const Component = () => {
      task(() => {
        const controllers: AbortController[] = [];

        // Create many concurrent async operations under pressure
        for (let i = 0; i < 100; i++) {
          const controller = new AbortController();
          controllers.push(controller);

          // Start async work without awaiting
          const promise = (async () => {
            for (let t = 0; t < 2; t++) {
              if (controller.signal.aborted) throw new Error('aborted');
              await new Promise<void>((r) => queueMicrotask(() => r()));
            }
          })();

          // Ignore results - focus on abort pressure
          promise.catch(() => {});
        }

        // Cleanup aborts all in-flight operations simultaneously
        return () => controllers.forEach((c) => c.abort());
      });

      return <div>Controllers created: 100</div>;
    };

    createIsland({ root: container, component: Component });
    flushScheduler();
    await waitForNextEvaluation();

    // Dispose triggers mass abort of in-flight operations
    cleanup();
  });
});
