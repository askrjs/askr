import { describe, expect, it, vi } from 'vite-plus/test';
import { cleanupApp } from '../../../src/boot';
import {
  cleanupComponent,
  createComponentInstance,
} from '../../../src/runtime/component';
import { task } from '../../../src/runtime/operations';
import { createTestContainer } from '../../../test-utils/render/test-renderer';
import { createIsland } from '../../../test-utils/render/create-island';

describe('cleanup invariants', () => {
  it('should finish disposal before surfacing strict cleanup errors', () => {
    const controller = new AbortController();
    const instance = createComponentInstance(
      'strict-cleanup',
      () => null,
      {},
      null
    );
    let aborted = false;

    controller.signal.addEventListener('abort', () => {
      aborted = true;
    });
    instance.abortController = controller;
    instance.cleanupStrict = true;
    instance.mounted = true;
    instance.notifyUpdate = () => {};
    (instance.cleanupFns ??= []).push(() => {
      throw new Error('cleanup failed');
    });

    expect(() => cleanupComponent(instance)).toThrow(AggregateError);
    expect(aborted).toBe(true);
    expect(instance.notifyUpdate).toBeNull();
    expect(instance.mounted).toBe(false);
  });

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
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    createIsland({
      root: container,
      component: () => {
        task(() => Promise.reject(new Error('task failed')));
        return <div>{'mounted'}</div>;
      },
    });

    await Promise.resolve();
    await Promise.resolve();

    expect(consoleError).toHaveBeenCalledWith(
      '[Askr] async mount operation failed:',
      expect.objectContaining({ message: 'task failed' })
    );

    consoleError.mockRestore();
    cleanup();
  });
});
