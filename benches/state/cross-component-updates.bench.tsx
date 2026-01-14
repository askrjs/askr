import { bench, describe } from 'vitest';
import { createIsland, state } from '../../src';
import {
  createTestContainer,
  flushScheduler,
} from '../../tests/helpers/test-renderer';

describe('cross component updates', () => {
  bench('parent to child', () => {
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

    update!();
    flushScheduler();

    cleanup();
  });

  bench('sibling updates', () => {
    const { container, cleanup } = createTestContainer();

    let leftSet: (() => void) | null = null;

    const Left = () => {
      const a = state(0);
      leftSet = () => a.set(a() + 1);
      return { type: 'span', children: [String(a())] };
    };

    const Right = () => {
      const b = state(0);
      return { type: 'span', children: [String(b())] };
    };

    const Parent = () => ({
      type: 'div',
      children: [Left(), Right()],
    });

    createIsland({ root: container, component: Parent });
    flushScheduler();

    leftSet!();
    flushScheduler();
    cleanup();
  });

  bench('deep tree', () => {
    const { container, cleanup } = createTestContainer();

    let rootSet: (() => void) | null = null;

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
      return {
        type: 'div',
        props: { children: [makeNested(10)(), LeafConsumer()] },
      };
    };

    createIsland({ root: container, component: Root });
    flushScheduler();

    rootSet!();
    flushScheduler();

    cleanup();
  });
});
