import { describe, it, expect, beforeEach, afterEach } from 'vite-plus/test';
import { state } from '../../../src';
import { createIsland } from '../../../test-utils/render/create-island';
import {
  createTestContainer,
  flushScheduler,
  getSchedulerState,
} from '../../../test-utils/render/test-renderer';

describe('cleanup with queued updates', () => {
  let { container, cleanup } = createTestContainer();

  beforeEach(() => {
    const result = createTestContainer();
    container = result.container;
    cleanup = result.cleanup;
  });

  afterEach(() => {
    cleanup();
  });

  it('should not execute a queued state rerender after cleanup before scheduler flush', () => {
    let renders = 0;
    let increment!: () => void;

    const App = () => {
      renders += 1;
      const count = state(0);
      increment = () => count.set((value) => value + 1);
      return <div>{count()}</div>;
    };

    createIsland({ root: container, component: App });
    flushScheduler();

    expect(renders).toBe(1);
    expect(container.textContent).toBe('0');

    increment();
    cleanup();

    expect(() => flushScheduler()).not.toThrow();
    expect(renders).toBe(1);
    expect(getSchedulerState().queueLength).toBe(0);
  });

  it('should not execute a queued child subscriber after root cleanup before scheduler flush', () => {
    let shared!: ReturnType<typeof state<number>>;
    let childRenders = 0;

    const Child = () => {
      childRenders += 1;
      return <div>{shared()}</div>;
    };

    const App = () => {
      shared = state(0);
      return (
        <section>
          <Child />
        </section>
      );
    };

    createIsland({ root: container, component: App });
    flushScheduler();

    expect(childRenders).toBe(1);
    expect(container.textContent).toBe('0');

    shared.set(1);
    cleanup();

    const readers = (shared as unknown as { _readers?: Map<unknown, unknown> })
      ._readers;
    expect(readers?.size ?? 0).toBe(0);

    expect(() => flushScheduler()).not.toThrow();
    expect(childRenders).toBe(1);
    expect(getSchedulerState().queueLength).toBe(0);
  });
});
