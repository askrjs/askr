/**
 * Tier: Framework / Transactional
 * Scenario: attribute-updates
 * Includes: state mutation, component render, scheduler enqueue/flush, attribute reconciliation
 * Excludes: pure DOM microbenchmarks (use dom::replacefragment or dom::keyed-reorder::pure-reconcile for that)
 *
 * Bench names use the standardized format: tier::scenario::size::pattern
 */

import { bench, describe } from 'vitest';
import { createIsland, state } from '../../src';
import type { State } from '../../src';
import {
  createTestContainer,
  flushScheduler,
} from '../../tests/helpers/test-renderer';
import { warmUp } from '../helpers/metrics';

describe('attribute updates', () => {
  bench(
    'framework::attribute-updates::100::batched-state-mutations',
    async () => {
      const { container, cleanup } = createTestContainer();

      let isActive: State<boolean> | null = null;

      const Component = () => {
        isActive = state(false);

        return (
          <button class={isActive!() ? 'active' : 'inactive'}>Click me</button>
        );
      };

      createIsland({ root: container, component: Component });
      flushScheduler();

      // Warm-up to stabilize JIT and shapes (even iterations preserve state)
      await warmUp(() => isActive!.set(!isActive!()), 10);

      // Perform attribute updates
      for (let i = 0; i < 100; i++) {
        isActive!.set(!isActive!());
      }
      flushScheduler();

      cleanup();
    }
  );

  bench(
    'framework::attribute-updates::100::batched-state-mutations-multi',
    async () => {
      const { container, cleanup } = createTestContainer();

      let count: State<number> | null = null;

      const Component = () => {
        count = state(0);

        return (
          <div
            data-count={String(count!())}
            data-even={count!() % 2 === 0 ? 'true' : 'false'}
            data-positive={count!() > 0 ? 'true' : 'false'}
            class={`count-${count!()}`}
          >
            {String(count!())}
          </div>
        );
      };

      createIsland({ root: container, component: Component });
      flushScheduler();

      // Warm-up
      await warmUp(() => count!.set(count!() + 1), 10);

      // Perform multiple attribute updates
      for (let i = 0; i < 100; i++) {
        count!.set(i);
      }
      flushScheduler();

      cleanup();
    }
  );

  bench(
    'framework::attribute-updates::100::batched-state-mutations-removals',
    async () => {
      const { container, cleanup } = createTestContainer();

      let hasAttribute: State<boolean> | null = null;

      const Component = () => {
        hasAttribute = state(true);

        return (
          <div
            class="base-class"
            {...(hasAttribute!() ? { 'data-temp': 'temporary' } : {})}
          >
            Test
          </div>
        );
      };

      createIsland({ root: container, component: Component });
      flushScheduler();

      // Warm-up
      await warmUp(() => hasAttribute!.set(!hasAttribute!()), 10);

      // Perform attribute removals
      for (let i = 0; i < 100; i++) {
        hasAttribute!.set(!hasAttribute!());
      }
      flushScheduler();

      cleanup();
    }
  );
});
