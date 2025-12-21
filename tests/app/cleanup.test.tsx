import { describe, it, expect } from 'vitest';
import { createIsland, cleanupApp } from '../../src/index';
import { createTestContainer } from '../helpers/test_renderer';

describe('createApp cleanup', () => {
  it('cleanupApp runs component cleanup functions', () => {
    const { container, cleanup } = createTestContainer();
    let cleaned = false;

    import { registerMountOperation } from '../../src/runtime/component';

    const Component = () => {
      // Register mount operation that returns a cleanup function
      registerMountOperation(() => {
        return () => {
          cleaned = true;
        };
      });
      return { type: 'div', children: [] } as unknown as any;
    };

    // Simulate mounting by creating island and then cleanupApp
    createIsland({ root: container, component: Component });

    // cleanup hasn't happened yet
    expect(cleaned).toBe(false);

    // Call cleanup API
    cleanupApp(container);

    // cleanup should have been executed
    expect(cleaned).toBe(true);

    cleanup();
  });
});
