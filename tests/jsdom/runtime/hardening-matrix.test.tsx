import { describe, expect, it } from 'vite-plus/test';
import { cleanupApp } from '../../../src/boot';
import { For } from '../../../src/control';
import { state, type State } from '../../../src/index';
import { resource } from '../../../src/resources';
import { globalScheduler, Scheduler } from '../../../src/runtime/scheduler';
import { createIsland } from '../../../test-utils/render/create-island';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';

async function settleResourceWork(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  flushScheduler();
}

describe('core hardening matrix', () => {
  it('should settle overlapping and already-superseded flush waiters', async () => {
    const scheduler = new Scheduler();
    scheduler.enqueue(() => {});
    const first = scheduler.waitForFlush(1);
    const second = scheduler.waitForFlush(2);

    scheduler.flush();
    await first;
    let secondSettled = false;
    void second.then(() => {
      secondSettled = true;
    });
    await Promise.resolve();
    expect(secondSettled).toBe(false);

    scheduler.enqueue(() => {});
    scheduler.flush();
    await second;
    await expect(scheduler.waitForFlush(1)).resolves.toBeUndefined();
  });

  it('should serialize a state write made reentrantly inside another updater', () => {
    const { container, cleanup } = createTestContainer();
    let first!: State<number>;
    let second!: State<number>;

    try {
      createIsland({
        root: container,
        component: () => {
          first = state(1);
          second = state(10);
          return <output>{`${String(first())}:${String(second())}`}</output>;
        },
      });

      first.set((previous) => {
        second.set((other) => other + 5);
        return previous + 1;
      });
      flushScheduler();

      expect(container.textContent).toBe('2:15');
    } finally {
      cleanup();
    }
  });

  it('should make state work inert when its owner unmounts during an active flush', () => {
    const { container, cleanup } = createTestContainer();
    let value!: State<number>;
    let renders = 0;

    try {
      createIsland({
        root: container,
        component: () => {
          renders += 1;
          value = state(0);
          return <output>{String(value())}</output>;
        },
      });

      globalScheduler.enqueue(() => cleanupApp(container));
      globalScheduler.enqueue(() => value.set(1));
      expect(() => flushScheduler()).not.toThrow();
      expect(renders).toBe(1);
      expect(globalScheduler.getState().queueLength).toBe(0);
    } finally {
      cleanup();
    }
  });

  it('should isolate two resources sharing a changing dependency across resolution races', async () => {
    const { container, cleanup } = createTestContainer();
    const firstResolvers = new Map<string, (value: string) => void>();
    const secondResolvers = new Map<string, (value: string) => void>();
    let dependency!: State<string>;

    try {
      createIsland({
        root: container,
        component: () => {
          dependency = state('old');
          const key = dependency();
          const first = resource(
            () =>
              new Promise<string>((resolve) => {
                firstResolvers.set(key, resolve);
              }),
            [key]
          );
          const second = resource(
            () =>
              new Promise<string>((resolve) => {
                secondResolvers.set(key, resolve);
              }),
            [key]
          );
          return (
            <output>{`${first.value ?? '-'}:${second.value ?? '-'}`}</output>
          );
        },
      });
      await settleResourceWork();

      dependency.set('new');
      flushScheduler();
      await settleResourceWork();
      secondResolvers.get('new')!('second:new');
      firstResolvers.get('new')!('first:new');
      await settleResourceWork();
      expect(container.textContent).toBe('first:new:second:new');

      firstResolvers.get('old')!('first:old');
      secondResolvers.get('old')!('second:old');
      await settleResourceWork();
      expect(container.textContent).toBe('first:new:second:new');
    } finally {
      cleanup();
    }
  });

  it('should reconcile two independent For lists in the same flush', () => {
    const { container, cleanup } = createTestContainer();
    let first!: State<string[]>;
    let second!: State<string[]>;

    try {
      createIsland({
        root: container,
        component: () => {
          first = state(['a', 'b']);
          second = state(['x', 'y']);
          return (
            <main>
              <ol data-list="first">
                <For each={() => first()} by={(item) => item}>
                  {(item) => <li>{item}</li>}
                </For>
              </ol>
              <ol data-list="second">
                <For each={() => second()} by={(item) => item}>
                  {(item) => <li>{item}</li>}
                </For>
              </ol>
            </main>
          );
        },
      });

      first.set(['b', 'c', 'a']);
      second.set(['y', 'z']);
      flushScheduler();

      const text = (selector: string) =>
        Array.from(container.querySelectorAll(`${selector} li`)).map(
          (item) => item.textContent
        );
      expect(text('[data-list="first"]')).toEqual(['b', 'c', 'a']);
      expect(text('[data-list="second"]')).toEqual(['y', 'z']);
    } finally {
      cleanup();
    }
  });
});
