import { describe, expect, it, vi } from 'vite-plus/test';
import { cleanupApp } from '../../../src/boot';
import { task } from '../../../src/resources';
import { createTestContainer } from '../../../test-utils/render/test-renderer';
import { createIsland } from '../../../test-utils/render/create-island';

describe('cleanup invariants', () => {
  it('should run async task cleanup exactly once when it resolves after unmount', async () => {
    const { container, cleanup } = createTestContainer();
    let resolveTask!: (cleanup: () => void) => void;
    let cleanupCount = 0;

    createIsland({
      root: container,
      component: () => {
        task(
          () =>
            new Promise((resolve) => {
              resolveTask = resolve;
            })
        );
        return <div>{'mounted'}</div>;
      },
    });

    cleanupApp(container);
    resolveTask(() => {
      cleanupCount += 1;
    });
    await Promise.resolve();
    await Promise.resolve();

    expect(cleanupCount).toBe(1);

    cleanupApp(container);
    cleanup();
    expect(cleanupCount).toBe(1);
  });

  it('should handle rejected async tasks without an unhandled rejection', async () => {
    const { container, cleanup } = createTestContainer();
    const reportError = vi.fn();
    vi.stubGlobal('reportError', reportError);

    createIsland({
      root: container,
      component: () => {
        task(() => Promise.reject(new Error('task failed')));
        return <div>{'mounted'}</div>;
      },
    });

    await Promise.resolve();
    await Promise.resolve();

    expect(reportError).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'task failed' })
    );

    vi.unstubAllGlobals();
    cleanup();
  });
});
