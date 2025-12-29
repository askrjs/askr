/**
 * Tier: Framework / Transactional
 * Scenario: mount-churn
 * Includes: component mount/unmount, cleanup, state toggling, scheduler flush
 * Excludes: pure DOM-only microbenchmarks
 *
 * These transactional benchmarks measure the cost of toggling component
 * presence repeatedly within the framework's scheduling model. Setup and
 * initial mount are performed in `beforeAll` to isolate the hot path.
 */

import { bench, describe, beforeAll, afterAll } from 'vitest';
import { createIsland, state } from '../../src';
import type { State } from '../../src';
import {
  createTestContainer,
  flushScheduler,
} from '../../tests/helpers/test-renderer';

describe('mount/unmount churn (transactional)', () => {
  describe('stateless subcomponent - 100 toggles (single commit semantics)', () => {
    let container: HTMLElement;
    let cleanup: () => void;
    let mounted!: State<boolean>;

    beforeAll(() => {
      const ctx = createTestContainer();
      container = ctx.container;
      cleanup = ctx.cleanup;

      const SubComponent = () => ({ type: 'div', children: ['Sub'] });
      const Component = () => {
        mounted = state(true);
        return mounted() ? SubComponent() : { type: 'div', children: [] };
      };

      createIsland({ root: container, component: Component });
      flushScheduler();
    });

    bench('framework::mount-churn::100::toggle', () => {
      for (let i = 0; i < 100; i++) mounted.set(!mounted());
      flushScheduler();
    });

    afterAll(() => cleanup());
  });

  describe('stateful subcomponent - 100 toggles (single commit semantics)', () => {
    let container: HTMLElement;
    let cleanup: () => void;
    let mounted!: State<boolean>;

    beforeAll(() => {
      const ctx = createTestContainer();
      container = ctx.container;
      cleanup = ctx.cleanup;

      const StatefulSub = () => {
        const count = state(0);
        return { type: 'div', children: [`Count: ${count()}`] };
      };

      const Component = () => {
        mounted = state(true);
        return mounted() ? StatefulSub() : { type: 'div', children: [] };
      };

      createIsland({ root: container, component: Component });
      flushScheduler();
    });

    bench('framework::mount-churn::100::toggle', () => {
      for (let i = 0; i < 100; i++) mounted.set(!mounted());
      flushScheduler();
    });

    afterAll(() => cleanup());
  });

  describe('cleanup-effectiveness scenario - 100 toggles (behavioral)', () => {
    let container: HTMLElement;
    let cleanup: () => void;
    let mounted!: State<boolean>;

    beforeAll(() => {
      const ctx = createTestContainer();
      container = ctx.container;
      cleanup = ctx.cleanup;

      const CleanupSub = () => ({ type: 'div', children: ['Cleanup'] });
      const Component = () => {
        mounted = state(true);
        return mounted() ? CleanupSub() : { type: 'div', children: [] };
      };

      createIsland({ root: container, component: Component });
      flushScheduler();
    });

    bench('framework::mount-churn::100::behavioral', () => {
      for (let i = 0; i < 100; i++) mounted.set(!mounted());
      flushScheduler();
    });

    afterAll(() => cleanup());
  });
});
