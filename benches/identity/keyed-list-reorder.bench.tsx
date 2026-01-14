import { bench, describe, beforeAll, afterAll } from 'vitest';
import { createIsland, state } from '../../src';
import type { State } from '../../src';
import {
  createTestContainer,
  flushScheduler,
} from '../../tests/helpers/test-renderer';

describe('keyed list reorder', () => {
  describe('5 items', () => {
    let container: HTMLElement;
    let cleanup: () => void;
    let items!: State<Array<{ id: number; text: string }>>;

    beforeAll(() => {
      const ctx = createTestContainer();
      container = ctx.container;
      cleanup = ctx.cleanup;

      const Component = () => {
        items = state([
          { id: 1, text: 'First' },
          { id: 2, text: 'Second' },
          { id: 3, text: 'Third' },
          { id: 4, text: 'Fourth' },
          { id: 5, text: 'Fifth' },
        ]);
        return {
          type: 'ul',
          children: items().map((item) => ({
            type: 'li',
            props: { 'data-key': String(item.id) },
            children: [item.text],
          })),
        };
      };

      createIsland({ root: container, component: Component });
      flushScheduler();
    });

    bench('100 reversals', () => {
      for (let i = 0; i < 100; i++) items.set([...items()].reverse());
      flushScheduler();
    });

    afterAll(() => cleanup());
  });

  describe('100 items', () => {
    let container: HTMLElement;
    let cleanup: () => void;
    let items!: State<Array<{ id: number; text: string }>>;

    beforeAll(() => {
      const ctx = createTestContainer();
      container = ctx.container;
      cleanup = ctx.cleanup;

      const Component = () => {
        items = state(
          Array.from({ length: 100 }, (_, i) => ({
            id: i + 1,
            text: `Item ${i + 1}`,
          }))
        );
        return {
          type: 'ul',
          children: items().map((item) => ({
            type: 'li',
            props: { 'data-key': String(item.id) },
            children: [item.text],
          })),
        };
      };

      createIsland({ root: container, component: Component });
      flushScheduler();
    });

    bench('100 reversals', () => {
      for (let i = 0; i < 100; i++) items.set([...items()].reverse());
      flushScheduler();
    });

    afterAll(() => cleanup());
  });

  describe('complex key sorts', () => {
    let container: HTMLElement;
    let cleanup: () => void;
    let items: State<
      Array<{ category: string; index: number; text: string }>
    > | null = null;

    beforeAll(() => {
      const ctx = createTestContainer();
      container = ctx.container;
      cleanup = ctx.cleanup;

      const Component = () => {
        items = state([
          { category: 'A', index: 1, text: 'A-1' },
          { category: 'A', index: 2, text: 'A-2' },
          { category: 'B', index: 1, text: 'B-1' },
          { category: 'B', index: 2, text: 'B-2' },
          { category: 'C', index: 1, text: 'C-1' },
        ]);
        return {
          type: 'ul',
          children: items().map((item) => ({
            type: 'li',
            key: `${item.category}-${item.index}`,
            props: { 'data-key': `${item.category}-${item.index}` },
            children: [item.text],
          })),
        };
      };

      createIsland({ root: container, component: Component });
      flushScheduler();
    });

    bench('100 sorts', () => {
      for (let i = 0; i < 100; i++) {
        items!.set(
          [...items!()].sort((a, b) => {
            if (a.category !== b.category)
              return a.category.localeCompare(b.category);
            return a.index - b.index;
          })
        );
      }
      flushScheduler();
    });

    afterAll(() => cleanup());
  });
});
