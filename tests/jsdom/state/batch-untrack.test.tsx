import { describe, expect, it } from 'vite-plus/test';
import { batch, derive, state, untrack, type State } from '../../../src';
import { createIsland } from '../../../test-utils/render/create-island';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';

describe('public batch() and untrack()', () => {
  it('should flush once when several writes are batched outside a component', () => {
    let renders = 0;
    let a!: State<number>;
    let b!: State<number>;
    const { container, cleanup } = createTestContainer();
    try {
      createIsland({
        root: container,
        component: () => {
          renders++;
          a = state(0);
          b = state(0);
          return (
            <p>
              {a()}-{b()}
            </p>
          );
        },
      });
      flushScheduler();
      const base = renders;
      const result = batch(() => {
        a.set(1);
        b.set(2);
        return 'done';
      });
      expect(result).toBe('done');
      // The outermost batch flushed synchronously, exactly once.
      expect(renders).toBe(base + 1);
      expect(container.textContent).toBe('1-2');
    } finally {
      cleanup();
    }
  });

  it('should defer the flush until the outermost nested batch exits', () => {
    let renders = 0;
    let a!: State<number>;
    const { container, cleanup } = createTestContainer();
    try {
      createIsland({
        root: container,
        component: () => {
          renders++;
          a = state(0);
          return <p>{a()}</p>;
        },
      });
      flushScheduler();
      const base = renders;
      batch(() => {
        batch(() => a.set(1));
        expect(renders).toBe(base);
        a.set(2);
      });
      expect(renders).toBe(base + 1);
      expect(container.textContent).toBe('2');
    } finally {
      cleanup();
    }
  });

  it('should read inside untrack() without subscribing', () => {
    let renders = 0;
    let a!: State<number>;
    let b!: State<number>;
    const { container, cleanup } = createTestContainer();
    try {
      createIsland({
        root: container,
        component: () => {
          renders++;
          a = state(0);
          b = state(0);
          const hidden = untrack(() => b());
          return (
            <p>
              {a()}:{hidden}
            </p>
          );
        },
      });
      flushScheduler();
      const base = renders;
      b.set(5);
      flushScheduler();
      expect(renders).toBe(base);
      a.set(1);
      flushScheduler();
      expect(container.textContent).toBe('1:5');
    } finally {
      cleanup();
    }
  });

  it('should not subscribe a derive to a source read through untrack()', () => {
    let a!: State<number>;
    let b!: State<number>;
    let computes = 0;
    const { container, cleanup } = createTestContainer();
    try {
      createIsland({
        root: container,
        component: () => {
          a = state(1);
          b = state(10);
          const sum = derive(() => {
            computes++;
            return a() + untrack(() => b());
          });
          return <p>{sum()}</p>;
        },
      });
      flushScheduler();
      const base = computes;
      b.set(20);
      flushScheduler();
      expect(computes).toBe(base);
      a.set(2);
      flushScheduler();
      expect(container.textContent).toBe('22');
    } finally {
      cleanup();
    }
  });
});
