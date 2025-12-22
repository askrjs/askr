import { describe, it, expect } from 'vitest';
import { createTestContainer } from '../helpers/test_renderer';
import type { JSXElement } from '../../src/jsx/types';

// Ensure async components are rejected by the runtime
describe('async component execution (DEPRECATED)', () => {
  it('should throw when mounting an async component', () => {
    const { container, cleanup } = createTestContainer();

    const AsyncComponent = async () => {
      await new Promise((r) => setTimeout(r, 1));
      return {
        type: 'div',
        props: { children: ['ok'] },
      } as unknown as JSXElement;
    };

    expect(() =>
      createIsland({
        root: container,
        component: AsyncComponent as unknown as () => JSXElement,
      })
    ).toThrow();

    cleanup();
  });
});
