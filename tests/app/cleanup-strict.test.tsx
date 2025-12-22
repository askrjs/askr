import { describe, it, expect } from 'vitest';
import type { JSXElement } from '../../src/jsx/types';
import { createIsland, cleanupApp } from '../../src/index';
import { createTestContainer } from '../helpers/test_renderer';
import { registerMountOperation } from '../../src/runtime/component';

describe('createIsland cleanup strict mode', () => {
  it('should surface cleanup errors in strict mode', () => {
    const { container, cleanup } = createTestContainer();
    let cleaned = false;

    const Component = () => {
      // Register a mount operation that returns a cleanup function which throws
      // This simulates a user error during cleanup that would otherwise be swallowed
      // Directly push a cleanup fn to instance via mount operation registration
      registerMountOperation(() => {
        return () => {
          cleaned = true;
          throw new Error('cleanup oops');
        };
      });
      return { type: 'div', children: [] } as unknown as JSXElement;
    };

    // Mount with cleanupStrict enabled by passing option through createIsland
    createIsland({
      root: container,
      component: Component,
      cleanupStrict: true,
    });

    // Cleanup should throw an AggregateError that contains the thrown error
    expect(() => cleanupApp(container)).toThrow(AggregateError);

    // Ensure cleanup function ran (even though it threw)
    expect(cleaned).toBe(true);

    cleanup();
  });
});
