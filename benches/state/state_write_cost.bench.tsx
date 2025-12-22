/**
 * State write cost benchmark
 *
 * Measures the cost of updating state values.
 * Validates that state updates trigger efficient rerenders.
 */

import { bench, describe } from 'vitest';
import { createIsland, state } from '../../src/index';
import {
  createTestContainer,
  flushScheduler,
  waitForNextEvaluation,
} from '../../tests/helpers/test_renderer';

describe('state write cost', () => {
  bench('100 single state updates (transactional)', async () => {
    const { container, cleanup } = createTestContainer();

    let updateFn: (() => void) | null = null;

    const Component = () => {
      const count = state(0);
      updateFn = () => count.set(count() + 1);

      return { type: 'div', children: [String(count())] };
    };

    createIsland({ root: container, component: Component });
    flushScheduler();
    await waitForNextEvaluation();

    // Perform the updates
    for (let i = 0; i < 100; i++) {
      updateFn!();
    }
    flushScheduler();
    await waitForNextEvaluation();

    cleanup();
  });

  bench('100 batched state updates (transactional)', async () => {
    const { container, cleanup } = createTestContainer();

    let updateFn: (() => void) | null = null;

    const Component = () => {
      const a = state(0);
      const b = state(0);
      const c = state(0);

      updateFn = () => {
        a.set(a() + 1);
        b.set(b() + 1);
        c.set(c() + 1);
      };

      return {
        type: 'div',
        children: [String(a() + b() + c())],
      };
    };

    createIsland({ root: container, component: Component });
    flushScheduler();
    await waitForNextEvaluation();

    // Perform batched updates
    for (let i = 0; i < 100; i++) {
      updateFn!();
    }
    flushScheduler();
    await waitForNextEvaluation();

    cleanup();
  });

  bench('100 cross-component updates (transactional)', async () => {
    const { container, cleanup } = createTestContainer();

    let updateFn: (() => void) | null = null;
    let sharedState!: import('../../src/runtime/state').State<number>;

    const ChildComponent = () => ({
      type: 'span',
      props: { children: [String(sharedState())] },
    });

    const ParentComponent = () => {
      sharedState = state(0);
      updateFn = () => sharedState.set(sharedState() + 1);

      return {
        type: 'div',
        props: {
          children: [ChildComponent(), ChildComponent(), ChildComponent()],
        },
      };
    };

    createIsland({ root: container, component: ParentComponent });
    flushScheduler();
    await waitForNextEvaluation();

    // Perform cross-component updates
    for (let i = 0; i < 100; i++) {
      updateFn!();
    }
    flushScheduler();
    await waitForNextEvaluation();

    cleanup();
  });
});
