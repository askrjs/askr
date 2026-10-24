import { describe, expect, it } from 'vite-plus/test';
import { derive, state, type State } from '../../../src';
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
});
