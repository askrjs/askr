/**
 * Rerender with no changes benchmark
 *
 * Measures the cost of rerendering when no actual changes occur.
 * Validates that unchanged components are processed efficiently.
 */

import { bench, describe, beforeEach, afterEach } from 'vitest';
import { createIsland, state } from '../../src';
import {
  createTestContainer,
  flushScheduler,
} from '../../tests/helpers/test-renderer';

describe('rerender no change', () => {
  describe('static component', () => {
    let container: HTMLElement;
    let cleanup: () => void;
    let triggerRerender: (() => void) | null = null;

    beforeEach(() => {
      const res = createTestContainer();
      container = res.container;
      cleanup = res.cleanup;

      const StaticComponent = () => {
        const renderCount = state(0);
        triggerRerender = () => renderCount.set(renderCount() + 1);

        // Always return the same structure
        return {
          type: 'div',
          children: [
            { type: 'h1', children: ['Static Title'] },
            { type: 'p', children: ['This content never changes'] },
          ],
        };
      };

      createIsland({ root: container, component: StaticComponent });
      flushScheduler();
      // pre-warm
      triggerRerender!();
      flushScheduler();
    });

    afterEach(() => {
      cleanup();
      triggerRerender = null;
    });

    // Kept: representative benchmark measuring cost of rerender when component output is unchanged.
    // Removed: additional cases for "baseline" and "transactional" variants and other "no-change" scenarios
    // (unchanged state, memoized computations, forced rerender). These were redundant and added noise.

    bench('static component (commit)', () => {
      triggerRerender!();
      flushScheduler();
    });
  });
});
