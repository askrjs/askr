import { bench, describe } from 'vitest';
import { createIsland, state } from '../../src';
import {
  createTestContainer,
  flushScheduler,
} from '../../tests/helpers/test-renderer';

describe('full replace', () => {
  bench('small tree', () => {
    const { container, cleanup } = createTestContainer();

    let toggle: (() => void) | null = null;

    const Component = () => {
      const type = state('a');
      toggle = () => type.set(type() === 'a' ? 'b' : 'a');

      return type() === 'a'
        ? {
            type: 'div',
            children: [
              { type: 'h1', children: ['Type A'] },
              { type: 'p', children: ['First'] },
              {
                type: 'ul',
                children: [
                  { type: 'li', children: ['Item 1'] },
                  { type: 'li', children: ['Item 2'] },
                ],
              },
            ],
          }
        : {
            type: 'section',
            children: [
              {
                type: 'header',
                children: [{ type: 'h2', children: ['Type B'] }],
              },
              {
                type: 'article',
                children: [
                  { type: 'p', children: ['Second'] },
                  {
                    type: 'ol',
                    children: [
                      { type: 'li', children: ['Option A'] },
                      { type: 'li', children: ['Option B'] },
                    ],
                  },
                ],
              },
            ],
          };
    };

    createIsland({ root: container, component: Component });
    flushScheduler();

    for (let i = 0; i < 10; i++) {
      toggle!();
      flushScheduler();
    }

    cleanup();
  });

  bench('large tree', () => {
    const { container, cleanup } = createTestContainer();

    let toggle: (() => void) | null = null;

    const Component = () => {
      const type = state('a');
      toggle = () => type.set(type() === 'a' ? 'b' : 'a');

      const createTree = (prefix: string) => ({
        type: 'div',
        children: Array.from({ length: 50 }, (_, i) => ({
          type: 'div',
          props: { 'data-index': i, key: String(i) },
          children: [
            { type: 'span', children: [`${prefix} Item ${i}`] },
            { type: 'p', children: [`Desc ${i}`] },
          ],
        })),
      });

      return type() === 'a' ? createTree('First') : createTree('Second');
    };

    createIsland({ root: container, component: Component });
    flushScheduler();

    for (let i = 0; i < 5; i++) {
      toggle!();
      flushScheduler();
    }

    cleanup();
  });

  bench('state churn', () => {
    const { container, cleanup } = createTestContainer();

    let update: (() => void) | null = null;
    let tick = 0;

    const Component = () => {
      const c1 = state(0);
      const c2 = state(0);
      const c3 = state(0);
      const t1 = state('text1');
      const t2 = state('text2');
      const flag = state(false);

      update = () => {
        c1.set(++tick % 100);
        c2.set(++tick % 100);
        c3.set(++tick % 100);
        t1.set(`reset-${++tick}`);
        t2.set(`reset-${++tick}`);
        flag.set(!flag());
      };

      return {
        type: 'div',
        children: [
          `Counter1: ${c1()}`,
          `Counter2: ${c2()}`,
          `Counter3: ${c3()}`,
          `Text1: ${t1()}`,
          `Text2: ${t2()}`,
          `Flag: ${flag()}`,
        ],
      };
    };

    createIsland({ root: container, component: Component });
    flushScheduler();

    for (let i = 0; i < 10; i++) {
      update!();
      flushScheduler();
    }

    cleanup();
  });
});
