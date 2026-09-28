import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { state } from '../../../src';
import { resource, task } from '../../../src/resources';
import { createIsland } from '../../../test-utils/render/create-island';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';

describe('comment host cleanup', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('should dispose each superseded null component reader exactly once', async () => {
    const { container, cleanup } = createTestContainer();
    let version!: ReturnType<typeof state<number>>;
    let shared!: ReturnType<typeof state<number>>;
    let cleanupCount = 0;
    let readerRenders = 0;

    const NullReader = ({ label }: { label: string }) => {
      readerRenders += 1;
      shared();
      task(() => () => {
        cleanupCount += 1;
      });
      void label;
      return null;
    };

    const App = () => {
      version = state(0);
      shared = state(0);
      const current = version();
      // Each generation keys a new reader. An unkeyed reader at the same
      // position is the same component and is kept across renders.
      return (
        <>
          <section>{`route-${current}`}</section>
          <NullReader
            key={`generation-${current}`}
            label={`generation-${current}`}
          />
        </>
      );
    };

    createIsland({ root: container, component: App });
    flushScheduler();
    await Promise.resolve();
    await Promise.resolve();

    for (let next = 1; next <= 10; next += 1) {
      version.set(next);
      flushScheduler();
      expect(cleanupCount).toBe(next);
      await Promise.resolve();
      await Promise.resolve();
    }

    // Only the live reader still reads the shared source.
    readerRenders = 0;
    shared.set(1);
    flushScheduler();
    expect(readerRenders).toBe(1);
    cleanup();
  });

  it('should dispose a null component before replacing its comment with text', async () => {
    const { container, cleanup } = createTestContainer();
    let showText!: ReturnType<typeof state<boolean>>;
    let shared!: ReturnType<typeof state<number>>;
    let cleanupCount = 0;
    let readerRenders = 0;

    const NullReader = () => {
      readerRenders += 1;
      shared();
      task(() => () => {
        cleanupCount += 1;
      });
      return null;
    };

    const App = () => {
      showText = state(false);
      shared = state(0);
      return <>{showText() ? 'ready' : <NullReader />}</>;
    };

    createIsland({ root: container, component: App });
    flushScheduler();
    await Promise.resolve();
    await Promise.resolve();

    showText.set(true);
    flushScheduler();

    expect(container.textContent).toBe('ready');
    expect(cleanupCount).toBe(1);
    readerRenders = 0;
    shared.set(1);
    flushScheduler();
    expect(readerRenders).toBe(0);

    cleanup();
  });

  it('should retain a closed component generation across a parent rerender', async () => {
    vi.useFakeTimers();
    const { container, cleanup } = createTestContainer();
    let rerenderParent!: () => void;
    let childRenderCount = 0;
    let timerCount = 0;

    const PresenceChild = ({ open }: { open: boolean }) =>
      open ? <span data-open={'true'}>{'open'}</span> : null;

    const TimedChild = () => {
      const open = state(true);
      childRenderCount += 1;

      resource(
        ({ signal }) => {
          if (!open()) return null;

          timerCount += 1;
          const timeoutId = setTimeout(() => open.set(false), 10);
          signal.addEventListener('abort', () => clearTimeout(timeoutId), {
            once: true,
          });
          return null;
        },
        [open()]
      );

      return <PresenceChild open={open()} />;
    };

    const App = () => {
      const version = state(0);
      rerenderParent = () => version.set((value) => value + 1);
      return (
        <main>
          <TimedChild key={'timed'} />
          <span>{String(version())}</span>
        </main>
      );
    };

    createIsland({ root: container, component: App });
    flushScheduler();
    await Promise.resolve();
    await Promise.resolve();

    expect(container.querySelector('[data-open="true"]')).not.toBeNull();
    expect(timerCount).toBe(1);

    await vi.advanceTimersByTimeAsync(10);
    flushScheduler();
    expect(container.querySelector('[data-open="true"]')).toBeNull();

    const rendersBeforeParentUpdate = childRenderCount;
    rerenderParent();
    flushScheduler();

    expect(container.querySelector('[data-open="true"]')).toBeNull();
    expect(timerCount).toBe(1);
    // The child keeps its closed state; it re-renders at most once.
    expect(childRenderCount).toBeLessThanOrEqual(rendersBeforeParentUpdate + 1);

    cleanup();
  });
});
