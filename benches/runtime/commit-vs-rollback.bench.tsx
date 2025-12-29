/**
 * Render atomicity benchmark
 *
 * Measures the cost of atomic rendering: success, failure, and partial failure.
 * Validates that rollbacks don't impose prohibitive overhead.
 */

import { bench, describe } from 'vitest';
import { createIsland } from '../../src';
import {
  createTestContainer,
  flushScheduler,
} from '../../tests/helpers/test-renderer';

describe('render atomicity', () => {
  bench('noop commit baseline', () => {
    for (let r = 0; r < 50; r++) {
      const { cleanup } = createTestContainer();
      // No work; just measure loop + harness overhead.
      cleanup();
    }
  });

  bench('successful commit', () => {
    for (let r = 0; r < 10; r++) {
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
      // createIsland() flushes synchronously during mount.
      cleanup();
    }
  });

  bench('rollback on error', () => {
    for (let r = 0; r < 10; r++) {
      const { container, cleanup } = createTestContainer();

      const Breaking = () => {
        // Throw during render to force atomic rollback
        throw new Error('render failure');
      };

      try {
        // createIsland() flushes synchronously; expected to throw.
        createIsland({ root: container, component: Breaking });
      } catch {
        // expected
      }

      // Best-effort drain in case anything remained queued.
      for (let i = 0; i < 3; i++) {
        try {
          flushScheduler();
        } catch {
          // expected
        }
      }

      // Ensure cleanup can't invalidate the benchmark sample.
      try {
        cleanup();
      } catch {
        // ignore
      }
    }
  });

  bench('partial failure rollback', () => {
    for (let r = 0; r < 10; r++) {
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

      try {
        // createIsland() flushes synchronously; expected to throw.
        createIsland({ root: container, component: Parent });
      } catch {
        // expected
      }

      // Best-effort drain in case anything remained queued.
      for (let i = 0; i < 3; i++) {
        try {
          flushScheduler();
        } catch {
          // expected
        }
      }

      // Ensure cleanup can't invalidate the benchmark sample.
      try {
        cleanup();
      } catch {
        // ignore
      }
    }
  });
});
