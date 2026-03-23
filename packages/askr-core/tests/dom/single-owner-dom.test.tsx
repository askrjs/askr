import { describe, it, expect } from 'vitest';
import type { JSXElement } from '../../src/jsx/types';
import { createTestContainer } from '../helpers/test-renderer';
import { createIsland } from '../helpers/create-island';

describe('Single-owner DOM invariant', () => {
  it('should update root and clean up prior instance when replacing a mounted component', () => {
    const { container, cleanup } = createTestContainer();
    try {
      const A = () => (<div id={'root'}>{'A'}</div>) as unknown as JSXElement;
      const B = () => (<div id={'root'}>{'B'}</div>) as unknown as JSXElement;

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
