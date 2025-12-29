import { describe, it, expect } from 'vitest';
import type { JSXElement } from '../../src/jsx/types';
import { cleanupApp } from '../../src/boot';
import { createTestContainer } from '../helpers/test-renderer';
import { registerMountOperation } from '../../src/runtime/component';
import { createIsland } from '../helpers/create-island';

describe('createIsland cleanup non-strict mode', () => {
  it('should swallow cleanup errors in non-strict mode', () => {
    const { container, cleanup } = createTestContainer();
    let cleaned = false;

    const Component = () => {
      registerMountOperation(() => {
        return () => {
          cleaned = true;
          throw new Error('cleanup oops');
        };
      });
      return { type: 'div', children: [] } as unknown as JSXElement;
    };

    createIsland({ root: container, component: Component });

    // Non-strict cleanup should not throw
    expect(() => cleanupApp(container)).not.toThrow();

    // Ensure cleanup function ran (even though it threw)
    expect(cleaned).toBe(true);

    cleanup();
  });
});
