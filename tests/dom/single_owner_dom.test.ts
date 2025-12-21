import { describe, it, expect } from 'vitest';
import type { JSXElement } from '../../src/jsx/types';
import { createTestContainer } from '../helpers/test_renderer';
import { createIsland } from '../../src/index';

describe('Single-owner DOM invariant', () => {
  it('should update root and clean up prior instance when replacing a mounted component', () => {
    const { container, cleanup } = createTestContainer();
    try {
      const A = () =>
        ({ type: 'div', props: { id: 'root' }, children: ['A'] }) as unknown as JSXElement;
      const B = () =>
        ({ type: 'div', props: { id: 'root' }, children: ['B'] }) as unknown as JSXElement;

      // Mount A
      createIsland({ root: container, component: A });

      // Replace with B — should not throw and should replace DOM
      expect(() =>
        createIsland({ root: container, component: B })
      ).not.toThrow();

      // DOM should now reflect B
      expect(container.textContent).toContain('B');
    } finally {
      cleanup();
    }
  });
});
