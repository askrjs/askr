import { describe, it, expect, vi } from 'vite-plus/test';
import type { JSXElement } from '../../../src/jsx/types';
import { cleanupApp } from '../../../src/boot';
import { createTestContainer } from '../../../test-utils/render/test-renderer';
import { registerMountOperation } from '../../../src/runtime';
import { createIsland } from '../../../test-utils/render/create-island';

describe('createIsland cleanup non-strict mode', () => {
  it('should report cleanup errors without throwing in non-strict mode', async () => {
    const reportError = vi.fn();
    vi.stubGlobal('reportError', reportError);
    const { container, cleanup } = createTestContainer();
    const error = new Error('cleanup oops');
    let cleaned = false;

    const Component = () => {
      registerMountOperation(() => {
        return () => {
          cleaned = true;
          throw error;
        };
      });
      return (<div></div>) as unknown as JSXElement;
    };

    createIsland({ root: container, component: Component });

    try {
      // Non-strict cleanup should not throw
      expect(() => cleanupApp(container)).not.toThrow();

      // Ensure cleanup function ran (even though it threw)
      expect(cleaned).toBe(true);

      // The failure is reported once the cleanup task finishes.
      expect(reportError).not.toHaveBeenCalled();
      await Promise.resolve();
      expect(reportError).toHaveBeenCalledTimes(1);
      expect(reportError).toHaveBeenCalledWith(error);
    } finally {
      cleanup();
      vi.unstubAllGlobals();
    }
  });
});
