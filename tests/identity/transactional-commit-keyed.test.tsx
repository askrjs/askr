import { describe, it, expect } from 'vitest';
import { state } from '../../src/index';
import { createTestContainer, flushScheduler } from '../helpers/test-renderer';
import type { JSXElement } from '../../src/jsx/types';
import { createIsland } from '../helpers/create-island';

describe('transactional commit - keyed list identity', () => {
  it('should preserve DOM node identity for keyed items across reorder', () => {
    const { cleanup: _cleanup } = createTestContainer();

    let setOrder: (v: string[]) => void = () => {};
    const Controlled = () => {
      const s = state(['a', 'b', 'c']);
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

    const { container, cleanup: cleanup2 } = createTestContainer();
    createIsland({ root: container, component: Controlled });

    const before = Array.from(
      container.querySelectorAll('[data-key]')
    ) as HTMLElement[];
    const nodeMap = new Map<string, HTMLElement>();
    for (const n of before) {
      const key = n.getAttribute('data-key') || '';
      nodeMap.set(key, n);
    }

    setOrder(['c', 'b', 'a']);
    flushScheduler();

    const after = Array.from(
      container.querySelectorAll('[data-key]')
    ) as HTMLElement[];

    // Ensure no new DOM nodes were created for the update — element identity
    // may shift position, but we must not allocate new elements for existing keys.
    for (const [, prev] of nodeMap.entries()) {
      expect(after.includes(prev)).toBe(true);
    }

    cleanup2();
  });
});
