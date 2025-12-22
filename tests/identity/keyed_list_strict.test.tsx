import { describe, it, expect } from 'vitest';
import { createIsland, state } from '../../src/index';
import { createTestContainer, flushScheduler } from '../helpers/test_renderer';
import type { JSXElement } from '../../src/jsx/types';

describe('strict keyed list guarantees', () => {
  it('should preserve DOM node identity for keyed items in mixed keyed/unkeyed lists', () => {
    const { container, cleanup } = createTestContainer();

    let setItems: (v: string[]) => void = () => {};
    const Controlled = () => {
      const s = state(['a', 'u1', 'b', 'c']);
      setItems = (v: string[]) => s.set(v);

      return {
        type: 'div',
        children: s().map((k) =>
          k.startsWith('u')
            ? ({ type: 'div', children: ['unkeyed'] } as unknown as JSXElement)
            : ({
                type: 'div',
                props: { key: k, 'data-key': k },
                children: [k],
              } as unknown as JSXElement)
        ),
      } as unknown as JSXElement;
    };

    createIsland({ root: container, component: Controlled });

    const before = Array.from(
      container.querySelectorAll('[data-key]')
    ) as HTMLElement[];
    const nodeMap = new Map<string, HTMLElement>();
    for (const n of before) {
      const key = n.getAttribute('data-key') || '';
      nodeMap.set(key, n);
    }

    setItems(['c', 'b', 'u1', 'a']);
    flushScheduler();

    const after = Array.from(
      container.querySelectorAll('[data-key]')
    ) as HTMLElement[];
    for (const [, prev] of nodeMap.entries()) {
      expect(after.includes(prev)).toBe(true);
    }

    cleanup();
  });

  it('should preserve DOM node identity when only props change for keyed items', () => {
    const { container, cleanup } = createTestContainer();

    let setProp: (key: string, val: string) => void = () => {};
    const Controlled = () => {
      const keys = ['a', 'b', 'c'];
      const prop = state<Record<string, string>>({ a: 'x', b: 'x', c: 'x' });
      setProp = (k: string, v: string) => prop.set({ ...prop(), [k]: v });

      return {
        type: 'div',
        children: keys.map(
          (k) =>
            ({
              type: 'div',
              props: { key: k, 'data-key': k, 'data-prop': prop()[k] },
              children: [k],
            }) as unknown as JSXElement
        ),
      } as unknown as JSXElement;
    };

    createIsland({ root: container, component: Controlled });

    const before = Array.from(
      container.querySelectorAll('[data-key]')
    ) as HTMLElement[];
    const nodeMap = new Map<string, HTMLElement>();
    for (const n of before) {
      const key = n.getAttribute('data-key') || '';
      nodeMap.set(key, n);
    }

    setProp('b', 'y');
    flushScheduler();

    const after = Array.from(
      container.querySelectorAll('[data-key]')
    ) as HTMLElement[];
    for (const [k, prev] of nodeMap.entries()) {
      const el = after.find((n) => n.getAttribute('data-key') === k);
      expect(el).toBeDefined();
      expect(el).toBe(prev); // same element instance
    }

    const b = container.querySelector('[data-key="b"]') as HTMLElement;
    expect(b.getAttribute('data-prop')).toBe('y');

    cleanup();
  });

  it('should replace DOM node when element tag changes for keyed item', () => {
    const { container, cleanup } = createTestContainer();

    let setTag: (key: string, tag: string) => void = () => {};
    const Controlled = () => {
      const tagMap = state<Record<string, string>>({ a: 'div' });
      setTag = (k: string, t: string) => tagMap.set({ ...tagMap(), [k]: t });

      return {
        type: 'div',
        children: [
          {
            type: tagMap().a as string,
            props: { key: 'a', 'data-key': 'a' },
            children: ['a'],
          } as unknown as JSXElement,
        ],
      } as unknown as JSXElement;
    };

    createIsland({ root: container, component: Controlled });

    const before = container.querySelector('[data-key="a"]') as HTMLElement;
    setTag('a', 'span');
    flushScheduler();

    const after = container.querySelector('[data-key="a"]') as HTMLElement;
    expect(after).not.toBe(before);
    expect(after.tagName.toLowerCase()).toBe('span');

    cleanup();
  });

  it('should not allocate new DOM nodes for existing keys under repeated random reorders', () => {
    const { container, cleanup } = createTestContainer();

    const N = 30;
    const iterations = 8;

    const initial = Array.from({ length: N }, (_, i) => `k${i}`);
    let setOrder: (v: string[]) => void = () => {};

    const Controlled = () => {
      const s = state(initial.slice());
      setOrder = (v: string[]) => s.set(v);

      return {
        type: 'div',
        children: s().map(
          (k) =>
            ({
              type: 'div',
              props: { key: k, 'data-key': k },
              children: [k],
            }) as unknown as JSXElement
        ),
      } as unknown as JSXElement;
    };

    createIsland({ root: container, component: Controlled });
    // Ensure initial render completes before we capture identity
    flushScheduler();

    const capture = () => {
      const map = new Map<string, HTMLElement>();
      for (const n of Array.from(
        container.querySelectorAll('[data-key]')
      ) as HTMLElement[]) {
        map.set(n.getAttribute('data-key') || '', n);
      }
      return map;
    };

    let nodes = capture();

    // Deterministic rotation test to exercise many moves while avoiding
    // random flakiness in CI environments.
    const order = initial.slice();
    for (let it = 0; it < iterations; it++) {
      // Rotate last element to front
      const v = order.pop()!;
      order.unshift(v);
      setOrder(order.slice());
      flushScheduler();

      const after = capture();
      // Ensure we did not lose any existing element instances — tolerate
      // acceptable reordering but ensure no allocations removed prior nodes.
      for (const [, prev] of nodes.entries()) {
        expect(Array.from(after.values()).includes(prev)).toBe(true);
      }

      // Use the new capture as the baseline for the next iteration
      nodes = after;
    }

    cleanup();
  });
});
