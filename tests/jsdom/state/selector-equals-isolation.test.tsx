import { afterEach, describe, expect, it } from 'vite-plus/test';
import { selector, state, type State } from '../../../src';
import { createIsland } from '../../../test-utils/render/create-island';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';

describe('selector equality isolation', () => {
  let cleanup = () => {};
  afterEach(() => cleanup());

  it('should not track reads made only by the selector comparator', () => {
    let incidental!: State<number>;
    let renders = 0;
    const { container, cleanup: dispose } = createTestContainer();
    cleanup = dispose;

    const Component = () => {
      const selected = state(1);
      incidental = state(0);
      const isSelected = selector(selected, (left, right) => {
        incidental();
        return left === right;
      });
      renders += 1;
      return <p>{String(isSelected(1))}</p>;
    };

    createIsland({ root: container, component: Component });
    flushScheduler();
    const settledRenders = renders;

    incidental.set(1);
    flushScheduler();

    expect(container.textContent).toBe('true');
    expect(renders).toBe(settledRenders);
  });

  it('should not track comparator reads in the selector source watcher', () => {
    let selected!: State<number>;
    let incidental!: State<number>;
    let sourceRuns = 0;
    const { container, cleanup: dispose } = createTestContainer();
    cleanup = dispose;

    const Component = () => {
      selected = state(1);
      incidental = state(0);
      const isSelected = selector(
        () => {
          sourceRuns += 1;
          return selected();
        },
        (left, right) => {
          incidental();
          return left === right;
        }
      );
      return <p>{String(isSelected(2))}</p>;
    };

    createIsland({ root: container, component: Component });
    flushScheduler();
    selected.set(2);
    flushScheduler();
    const settledRuns = sourceRuns;

    incidental.set(1);
    flushScheduler();

    expect(sourceRuns).toBe(settledRuns);
  });

  it('should not publish a selector source change when its comparator throws', () => {
    let selected!: State<number>;
    let isSelected!: ReturnType<typeof selector<number>>;
    let failComparison = false;
    const failure = new Error('selector comparator failed');
    const { container, cleanup: dispose } = createTestContainer();
    cleanup = dispose;

    const Component = () => {
      selected = state(0);
      isSelected = selector(selected, (left, right) => {
        if (failComparison) {
          failComparison = false;
          throw failure;
        }
        return left === right;
      });
      return <p>{String(isSelected(1))}</p>;
    };

    createIsland({ root: container, component: Component });
    flushScheduler();
    failComparison = true;
    selected.set(1);

    expect(() => flushScheduler()).toThrow(failure);
    expect(isSelected(2)).toBe(false);
    expect(container.textContent).toBe('false');
  });
});
