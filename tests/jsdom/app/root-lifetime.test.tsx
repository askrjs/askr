import { describe, expect, it, vi } from 'vite-plus/test';
import { cleanupApp, hasApp } from '../../../src/boot';
import { registerRootCleanupCallback } from '../../../src/boot/root-lifecycle';
import { registerMountOperation } from '../../../src/runtime';
import { resource } from '../../../src/runtime/operations';
import { createIsland } from '../../../test-utils/render/create-island';
import { createTestContainer } from '../../../test-utils/render/test-renderer';

describe('root lifetime cleanup', () => {
  it.each(
    (['component', 'ref', 'root', 'strict root'] as const).flatMap((phase) =>
      (['cleanupApp', 'innerHTML'] as const).map(
        (trigger) => [phase, trigger] as const
      )
    )
  )(
    'should preserve a replacement mounted from %s cleanup through %s',
    (phase, trigger) => {
      const { container, cleanup } = createTestContainer();
      const replacementCleanup = vi.fn();
      const replacementClick = vi.fn();
      let replacementSignal!: AbortSignal;
      let replaced = false;
      const replace = () => {
        if (replaced) return;
        replaced = true;
        createIsland({
          root: container,
          component: () => {
            registerMountOperation(() => replacementCleanup);
            resource(({ signal }) => {
              replacementSignal = signal;
              return 'active';
            });
            return <button onClick={replacementClick}>replacement</button>;
          },
        });
        if (phase === 'strict root') throw new Error('old lifetime failed');
      };
      createIsland({
        root: container,
        cleanupStrict: true,
        component: () => {
          if (phase === 'component') registerMountOperation(() => replace);
          return (
            <div
              ref={(element) => {
                if (phase === 'ref' && element === null) replace();
              }}
            >
              original
            </div>
          );
        },
      });
      if (phase === 'root' || phase === 'strict root')
        registerRootCleanupCallback(container, replace);
      try {
        const retire = () => {
          if (trigger === 'cleanupApp') cleanupApp(container);
          else container.innerHTML = '';
        };
        if (phase === 'strict root') expect(retire).toThrow(AggregateError);
        else retire();
        expect(hasApp(container)).toBe(true);
        expect(container.textContent).toBe('replacement');
        container.querySelector('button')!.click();
        expect(replacementClick).toHaveBeenCalledOnce();
        expect(replacementCleanup).not.toHaveBeenCalled();
        expect(replacementSignal.aborted).toBe(false);
        cleanupApp(container);
        expect(replacementSignal.aborted).toBe(true);
        expect(replacementCleanup).toHaveBeenCalledTimes(1);
        expect(hasApp(container)).toBe(false);
      } finally {
        cleanup();
      }
    }
  );

  it('should clear innerHTML normally when cleanup does not mount a replacement', () => {
    const { container, cleanup } = createTestContainer();
    const retired = vi.fn();
    createIsland({
      root: container,
      component: () => {
        registerMountOperation(() => retired);
        return <div>original</div>;
      },
    });
    container.innerHTML = '';
    expect(container.textContent).toBe('');
    expect(hasApp(container)).toBe(false);
    expect(retired).toHaveBeenCalledOnce();
    cleanup();
  });

  it('should let a mount during update cleanup supersede the interrupted update', () => {
    const { container, cleanup } = createTestContainer();
    const replacementCleanup = vi.fn();
    createIsland({ root: container, component: () => <div>original</div> });
    registerRootCleanupCallback(container, () => {
      createIsland({
        root: container,
        component: () => {
          registerMountOperation(() => replacementCleanup);
          return <div>replacement</div>;
        },
      });
    });
    createIsland({ root: container, component: () => <div>interrupted</div> });
    expect(container.textContent).toBe('replacement');
    cleanupApp(container);
    expect(replacementCleanup).toHaveBeenCalledOnce();
    cleanup();
  });

  it('should not let a retired unsubscribe erase replacement cleanup callbacks', () => {
    const { container, cleanup } = createTestContainer();
    const unregister = registerRootCleanupCallback(container, () => {});
    cleanupApp(container);
    createIsland({ root: container, component: () => <div /> });
    const replacementCleanup = vi.fn();
    registerRootCleanupCallback(container, replacementCleanup);
    unregister();
    cleanupApp(container);
    expect(replacementCleanup).toHaveBeenCalledOnce();
    cleanup();
  });
});
