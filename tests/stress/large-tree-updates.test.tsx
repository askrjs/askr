// tests/stress/large_tree_updates.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createIsland, state } from '../../src/index';
import type { JSXElement } from '../../src/jsx/types';
import { createTestContainer, flushScheduler } from '../helpers/test-renderer';

describe('large tree updates (STRESS)', () => {
  let { container, cleanup } = createTestContainer();
  beforeEach(() => ({ container, cleanup } = createTestContainer()));
  afterEach(() => cleanup());

  it('should render and update when list has 1000 items', async () => {
    let tick: ReturnType<typeof state<number>> | null = null;

    const Component = () => {
      tick = state(0);
      return {
        type: 'div',
        props: {
          children: Array.from({ length: 1000 }, (_, i) => ({
            type: 'span',
            props: { 'data-i': i },
            children: [`${i}:${tick!()}`],
          })),
        },
      };
    };

    createIsland({ root: container, component: Component });
    flushScheduler();

    expect(container.querySelectorAll('span').length).toBe(1000);
    expect(container.textContent).toContain('999:0');

    tick!.set(1);
    flushScheduler();
    expect(container.textContent).toContain('0:1');
    expect(container.textContent).toContain('999:1');
  });

  it('should render when nesting is 100 levels deep', async () => {
    const Nested = (depth: number): JSXElement =>
      depth === 0
        ? { type: 'span', props: { children: ['leaf'] } }
        : {
            type: 'div',
            props: { 'data-depth': depth, children: [Nested(depth - 1)] },
          };

    createIsland({
      root: container,
      component: () => Nested(100) as unknown as JSXElement,
    });
    flushScheduler();

    // 100 nested divs from the component, plus a portal host div from the runtime
    expect(container.querySelectorAll('div').length).toBeGreaterThanOrEqual(
      100
    );
    expect(container.textContent).toContain('leaf');
  });

  it('should update efficiently when tree has 1000 siblings', async () => {
    let value: ReturnType<typeof state<string>> | null = null;
    const Component = () => {
      value = state('a');
      return {
        type: 'div',
        children: Array.from({ length: 1000 }, (_, i) => ({
          type: 'span',
          props: { 'data-i': i },
          children: [`${value!()}-${i}`],
        })),
      };
    };

    createIsland({ root: container, component: Component });
    flushScheduler();

    value!.set('b');
    flushScheduler();

    expect(container.textContent).toContain('b-0');
    expect(container.textContent).toContain('b-999');
  });
});
