/**
 * Render atomicity benchmark
 *
 * Measures the cost of atomic rendering: success, failure, and partial failure.
 * Validates that rollbacks don't impose prohibitive overhead.
 */

import { bench, describe } from 'vitest';
import { createIsland } from '../../src/index';
import {
  createTestContainer,
  flushScheduler,
} from '../../tests/helpers/test-renderer';

describe('render atomicity', () => {
  bench('noop commit baseline', async () => {
    const { container: _container, cleanup } = createTestContainer();
    flushScheduler();
    await waitForNextEvaluation();
    cleanup();
  });

  bench('successful commit', async () => {
    const { container, cleanup } = createTestContainer();

    const Component = () => ({
      type: 'div',
      children: Array.from({ length: 50 }, (_, i) => ({
        type: 'div',
        props: { key: String(i) },
        children: [String(i)],
      })),
    });

    createIsland({ root: container, component: Component });
    flushScheduler();
    await waitForNextEvaluation();

    // Repeat to amortize scheduler overhead
    for (let i = 0; i < 10; i++) {
      flushScheduler();
      await waitForNextEvaluation();
    }

    cleanup();
  });

  bench('rollback on error', async () => {
    const { container, cleanup } = createTestContainer();

    const Breaking = () => {
      // Throw during render to force atomic rollback
      throw new Error('render failure');
    };

    createIsland({ root: container, component: Breaking });

    // Repeat to amortize scheduler overhead
    for (let i = 0; i < 10; i++) {
      try {
        flushScheduler();
        await waitForNextEvaluation();
      } catch {
        // expected: swallow to allow benchmark to complete
      }
    }

    cleanup();
  });

  bench('partial failure rollback', async () => {
    const { container, cleanup } = createTestContainer();

    const Good = () => ({ type: 'div', children: ['ok'] });
    const Bad = () => {
      // Only this child throws during render
      throw new Error('child failure');
    };

    const Parent = () => ({
      type: 'div',
      // Call child render functions directly so TypeScript infers VNode shapes correctly.
      children: [Good(), Bad(), Good()],
    });

    createIsland({ root: container, component: Parent });

    // Repeat to amortize scheduler overhead
    for (let i = 0; i < 10; i++) {
      try {
        flushScheduler();
        await waitForNextEvaluation();
      } catch {
        // expected: swallow to allow benchmark to complete
      }
    }

    cleanup();
  });
});
