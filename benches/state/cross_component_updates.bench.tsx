/**
 * Cross-component updates benchmark
 *
 * Measures the cost of state changes that affect multiple components.
 * Validates that updates fan out efficiently.
 */

import { bench, describe } from 'vitest';
import { createIsland, state } from '../../src/index';
import {
  createTestContainer,
  flushScheduler,
  waitForNextEvaluation,
} from '../../tests/helpers/test_renderer';

describe('cross component updates', () => {
  bench('parent to child update (transactional)', async () => {
    const { container, cleanup } = createTestContainer();

    let update: (() => void) | null = null;

    const Child = ({ value }: { value: number }) => ({
      type: 'div',
      children: [String(value)],
    });

    const Parent = () => {
      const v = state(0);
      update = () => v.set(v() + 1);
      return {
        type: 'div',
        children: [
          Child({ value: v() }),
          Child({ value: v() }),
          Child({ value: v() }),
        ],
      };
    };

    createIsland({ root: container, component: Parent });
    flushScheduler();
    await waitForNextEvaluation();

    // Trigger parent update and measure re-render cost
    update!();
    flushScheduler();
    await waitForNextEvaluation();

    cleanup();
  });

  bench('sibling component updates (transactional)', async () => {
    const { container, cleanup } = createTestContainer();

    let leftSet: (() => void) | null = null;
    let _rightSet: (() => void) | null = null;

    const Left = () => {
      const a = state(0);
      leftSet = () => a.set(a() + 1);
      return { type: 'span', children: [String(a())] };
    };

    const Right = () => {
      const b = state(0);
      _rightSet = () => b.set(b() + 1);
      return { type: 'span', children: [String(b())] };
    };

    const Parent = () => ({
      type: 'div',
      children: [Left(), Right()],
    });

    createIsland({ root: container, component: Parent });
    flushScheduler();
    await waitForNextEvaluation();

    // Update only one sibling and flush
    leftSet!();
    flushScheduler();
    await waitForNextEvaluation();
    cleanup();
  });

  bench('deep tree propagation (transactional)', async () => {
    const { container, cleanup } = createTestContainer();

    let rootSet: (() => void) | null = null;

    // Build a chain of 10 nested components that read a root value
    const makeNested = (
      depth: number
    ): (() => { type: string; children?: unknown[] }) => {
      if (depth === 0) {
        return () => ({ type: 'span', children: ['leaf'] });
      }
      const Child = makeNested(depth - 1);
      return () => ({ type: 'div', children: [Child()] });
    };

    const LeafConsumer = () => ({ type: 'span', children: ['consumer'] });

    const Root = () => {
      const v = state(0);
      rootSet = () => v.set(v() + 1);
      // pass value down implicitly via re-rendering (no explicit props)
      return {
        type: 'div',
        props: { children: [makeNested(10)(), LeafConsumer()] },
      };
    };

    createIsland({ root: container, component: Root });
    flushScheduler();
    await waitForNextEvaluation();

    // Trigger root update which must propagate through nested tree
    rootSet!();
    flushScheduler();
    await waitForNextEvaluation();

    cleanup();
  });
});
