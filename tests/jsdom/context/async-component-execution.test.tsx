import { describe, it, expect } from 'vite-plus/test';
import { createTestContainer } from '../../../test-utils/render/test-renderer';
import type { JSXElement } from '../../../src/jsx/types';

// Ensure async components are rejected by the runtime
describe('async component execution (DEPRECATED)', () => {
  it('should throw when mounting an async component', () => {
    const { container, cleanup } = createTestContainer();

    const AsyncComponent = async () => {
      await new Promise((r) => setTimeout(r, 1));
      return (<div>{'ok'}</div>) as unknown as JSXElement;
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
