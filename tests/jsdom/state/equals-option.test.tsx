import { describe, expect, it, vi } from 'vite-plus/test';
import { derive, state, untrack, type State } from '../../../src';
import { createIsland } from '../../../test-utils/render/create-island';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';

describe('equals option', () => {
  it('should suppress a state notification when the comparator returns true', () => {
    let renders = 0;
    let point!: ReturnType<typeof state<{ x: number }>>;
    const { container, cleanup } = createTestContainer();
    try {
      createIsland({
        root: container,
        component: () => {
          renders++;
          point = state({ x: 1 }, { equals: (a, b) => a.x === b.x });
          return <p>{point().x}</p>;
        },
      });
      flushScheduler();
      const base = renders;
      point.set({ x: 1 });
      flushScheduler();
      expect(renders).toBe(base);
      point.set({ x: 2 });
      flushScheduler();
      expect(renders).toBe(base + 1);
      expect(container.textContent).toBe('2');
    } finally {
      cleanup();
    }
  });

  it('should call the state comparator once for an unequal write', () => {
    let value!: ReturnType<typeof state<number>>;
    const compare = vi.fn(
      (previous: number, next: number) => previous === next
    );
    const { container, cleanup } = createTestContainer();
    try {
      createIsland({
        root: container,
        component: () => {
          value = state<number>(0, { equals: compare });
          return <p>{value()}</p>;
        },
      });
      flushScheduler();
      compare.mockClear();
      value.set(1);
      expect(compare).toHaveBeenCalledTimes(1);
      expect(value()).toBe(1);
    } finally {
      cleanup();
    }
  });

  it('should default to Object.is for state', () => {
    let renders = 0;
    let point!: ReturnType<typeof state<{ x: number }>>;
    const { container, cleanup } = createTestContainer();
    try {
      createIsland({
        root: container,
        component: () => {
          renders++;
          point = state({ x: 1 });
          return <p>{point().x}</p>;
        },
      });
      flushScheduler();
      const base = renders;
      point.set({ x: 1 });
      flushScheduler();
      expect(renders).toBe(base + 1);
    } finally {
      cleanup();
    }
  });

  it('should cut off a derive whose comparator reports equal values', () => {
    let renders = 0;
    let n!: State<number>;
    const { container, cleanup } = createTestContainer();
    try {
      createIsland({
        root: container,
        component: () => {
          renders++;
          n = state(1);
          const bucket = derive(() => ({ b: Math.floor(n() / 10) }), {
            equals: (a, b) => a.b === b.b,
          });
          return <p>{bucket().b}</p>;
        },
      });
      flushScheduler();
      const base = renders;
      n.set(5);
      flushScheduler();
      expect(renders).toBe(base);
      n.set(15);
      flushScheduler();
      expect(renders).toBe(base + 1);
      expect(container.textContent).toBe('1');
    } finally {
      cleanup();
    }
  });

  it('should accept equals on the mapped derive form', () => {
    let renders = 0;
    let n!: State<number>;
    const { container, cleanup } = createTestContainer();
    try {
      createIsland({
        root: container,
        component: () => {
          renders++;
          n = state(1);
          const parity = derive(n, (value) => ({ odd: value % 2 === 1 }), {
            equals: (a, b) => a!.odd === b!.odd,
          });
          return <p>{String(parity()!.odd)}</p>;
        },
      });
      flushScheduler();
      const base = renders;
      n.set(3);
      flushScheduler();
      expect(renders).toBe(base);
    } finally {
      cleanup();
    }
  });

  it('should not track comparator reads as outer derive dependencies', () => {
    let source!: State<number>;
    let side!: State<number>;
    let inner!: () => number;
    let outer!: () => number;
    let outerRuns = 0;
    const { container, cleanup } = createTestContainer();
    try {
      createIsland({
        root: container,
        component: () => {
          source = state(0);
          side = state(0);
          inner = derive(() => source(), {
            equals: (previous, next) => {
              side();
              return previous === next;
            },
          });
          outer = derive(() => {
            outerRuns++;
            return inner();
          });
          void untrack(() => outer());
          return <p />;
        },
      });
      flushScheduler();
      source.set(1);
      expect(outer()).toBe(1);
      const settledRuns = outerRuns;
      side.set(1);
      flushScheduler();
      expect(outerRuns).toBe(settledRuns);
    } finally {
      cleanup();
    }
  });

  it('should reject a comparator that recursively reads its derived value', () => {
    let source!: State<number>;
    let value!: () => number;
    const { container, cleanup } = createTestContainer();
    try {
      createIsland({
        root: container,
        component: () => {
          source = state(0);
          value = derive(() => source(), {
            equals: (previous, next) => {
              value();
              return previous === next;
            },
          });
          void untrack(() => value());
          return <p />;
        },
      });
      flushScheduler();
      source.set(1);
      expect(() => untrack(() => value())).toThrow(
        'derive() cannot read itself recursively'
      );
    } finally {
      cleanup();
    }
  });
});
