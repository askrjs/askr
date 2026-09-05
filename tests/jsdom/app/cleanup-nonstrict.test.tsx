import { describe, it, expect, vi } from 'vite-plus/test';
import type { JSXElement } from '../../../src/jsx/types';
import { cleanupApp } from '../../../src/boot';
import { createTestContainer } from '../../../test-utils/render/test-renderer';
import { registerMountOperation } from '../../../src/runtime';
import { createIsland } from '../../../test-utils/render/create-island';

describe('createIsland cleanup non-strict mode', () => {
  it('should swallow cleanup errors in non-strict mode', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { container, cleanup } = createTestContainer();
    let cleaned = false;

    const Component = () => {
      registerMountOperation(() => {
        return () => {
          cleaned = true;
          throw new Error('cleanup oops');
        };
      });
      return (<div></div>) as unknown as JSXElement;
    };

    createIsland({ root: container, component: Component });

    // Non-strict cleanup should not throw
    try {
      expect(() => cleanupApp(container)).not.toThrow();

      // Ensure cleanup function ran (even though it threw)
      expect(cleaned).toBe(true);
      expect(warn).toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }

    cleanup();
  });
});
