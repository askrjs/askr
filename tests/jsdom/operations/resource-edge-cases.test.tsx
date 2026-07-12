import { describe, expect, it } from 'vite-plus/test';
import { resource } from '../../../src/resources';
import type { JSXElement } from '../../../src/jsx/types';
import { state } from '../../../src';
import {
  cleanupComponent,
  createComponentInstance,
  mountInstanceInline,
  renderComponentInline,
} from '../../../src/runtime/component';
import { createIsland } from '../../../test-utils/render/create-island';
import {
  createTestContainer,
  flushScheduler,
  getSchedulerState,
} from '../../../test-utils/render/test-renderer';

async function settleResourceWork(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  flushScheduler();
}

describe('resource edge cases', () => {
  it('should ignore the initial queued post-lane start after refresh advances generation', () => {
    const { container, cleanup } = createTestContainer();
    let starts = 0;
    let snapshot: { refresh(): void; value: string | null } | null = null;

    const App = (): JSXElement => {
      snapshot = resource<string>(() => {
        starts += 1;
        return `run:${starts}`;
      }, []);

      return <div>{snapshot.value ?? 'loading'}</div>;
    };

    const instance = createComponentInstance(
      'resource-refresh-generation',
      App,
      {},
      container
    );

    try {
      mountInstanceInline(instance, container);
      renderComponentInline(instance);

      expect(starts).toBe(0);
      expect(getSchedulerState().laneQueues.post).toBeGreaterThan(0);

      snapshot!.refresh();

      expect(starts).toBe(1);
      expect(snapshot!.value).toBe('run:1');

      flushScheduler();

      expect(starts).toBe(1);
      expect(getSchedulerState().queueLength).toBe(0);
    } finally {
      cleanupComponent(instance);
      cleanup();
    }
  });

  // Finding 1: deps compared with !== instead of Object.is.
  // A NaN dependency satisfies NaN !== NaN on every render, so depsChanged is
  // always true and the loader refetches on every render. A stable NaN dep
  // should be treated as unchanged (Object.is(NaN, NaN) === true).
  it('should NOT refetch when a NaN dependency is stable across renders', async () => {
    const calls: number[] = [];
    let bump!: ReturnType<typeof state<number>>;

    const App = (): JSXElement => {
      bump = state(0);
      const result = resource(async () => {
        calls.push(bump());
        return 'ok';
      }, [Number.NaN]);

      return (
        <button onClick={() => bump.set((n) => n + 1)}>
          {result.value ?? 'loading'}:{bump()}
        </button>
      );
    };

    const { container, cleanup } = createTestContainer();
    try {
      createIsland({ root: container, component: App });
      flushScheduler();
      await settleResourceWork();

      expect(calls.length).toBe(1);

      // Trigger an unrelated re-render. The NaN dep is unchanged, so the
      // resource must not refetch.
      (container.firstElementChild as HTMLButtonElement).click();
      flushScheduler();
      await settleResourceWork();
      (container.firstElementChild as HTMLButtonElement).click();
      flushScheduler();
      await settleResourceWork();

      expect(calls.length).toBe(1);
    } finally {
      cleanup();
    }
  });

  // Finding 2 (CONFIRMED BUG): a deps-driven refetch must surface pending=true
  // during the triggering render (stale-while-revalidate: the previous value is
  // retained until the new fetch resolves). Previously the snapshot was never
  // republished as pending, so the UI jumped straight from the old value to the
  // new value and could never show a loading state on a dependency change.
  it('should surface pending=true (retaining the old value) during a deps-driven refetch', async () => {
    let resolveSecond!: (v: string) => void;
    let id!: ReturnType<typeof state<string>>;
    let pendingDuringRefetch: boolean | null = null;
    let valueDuringRefetch: string | null = null;

    const App = (): JSXElement => {
      id = state('a');
      const result = resource(
        () =>
          id() === 'a'
            ? Promise.resolve('value:a')
            : new Promise<string>((resolve) => {
                resolveSecond = resolve;
              }),
        [id()]
      );

      if (id() === 'b' && result.pending) {
        pendingDuringRefetch = result.pending;
        valueDuringRefetch = result.value;
      }

      return <div>{result.value ?? 'loading'}</div>;
    };

    const { container, cleanup } = createTestContainer();
    try {
      createIsland({ root: container, component: App });
      flushScheduler();
      await settleResourceWork();
      expect(container.textContent).toBe('value:a');

      id.set('b');
      flushScheduler();
      await settleResourceWork();

      // Loading state must be visible, with the previous value retained (SWR).
      expect(pendingDuringRefetch).toBe(true);
      expect(valueDuringRefetch).toBe('value:a');

      resolveSecond('value:b');
      await settleResourceWork();
      expect(container.textContent).toBe('value:b');
    } finally {
      cleanup();
    }
  });

  // Finding 3 (PROBE): change deps again while the first fetch is still in
  // flight. Count loader invocations to detect a double-fetch for the same
  // final dep value.
  it('should run the loader once per distinct dep value even under rapid changes', async () => {
    const calls: string[] = [];
    let id!: ReturnType<typeof state<string>>;

    const App = (): JSXElement => {
      id = state('a');
      const result = resource(async () => {
        calls.push(id());
        return `value:${id()}`;
      }, [id()]);
      return <div>{result.value ?? 'loading'}</div>;
    };

    const { container, cleanup } = createTestContainer();
    try {
      createIsland({ root: container, component: App });
      flushScheduler();
      await settleResourceWork();
      expect(calls).toEqual(['a']);

      // Two synchronous dep changes before settling.
      id.set('b');
      flushScheduler();
      id.set('c');
      flushScheduler();
      await settleResourceWork();

      // The final value must be 'c'. We tolerate an intermediate 'b' run but
      // assert no duplicate run of the same final value.
      expect(calls[calls.length - 1]).toBe('c');
      expect(calls.filter((c) => c === 'c').length).toBe(1);
      expect(container.textContent).toBe('value:c');
    } finally {
      cleanup();
    }
  });

  // Finding 4 (PROBE): refresh() from an event handler re-runs the loader and
  // surfaces the new value; pending must resolve back to false.
  it('should re-run the loader on refresh() and resolve pending', async () => {
    let count = 0;

    const App = (): JSXElement => {
      const result = resource(async () => {
        count += 1;
        return `run:${count}`;
      }, []);

      return (
        <button onClick={() => result.refresh()}>
          {result.pending ? 'loading' : result.value}
        </button>
      );
    };

    const { container, cleanup } = createTestContainer();
    try {
      createIsland({ root: container, component: App });
      flushScheduler();
      await settleResourceWork();
      expect(container.textContent).toBe('run:1');

      (container.firstElementChild as HTMLButtonElement).click();
      await settleResourceWork();
      expect(container.textContent).toBe('run:2');
      expect(count).toBe(2);
    } finally {
      cleanup();
    }
  });
});
