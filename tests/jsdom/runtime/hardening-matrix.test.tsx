import { describe, expect, it } from 'vite-plus/test';
import { cleanupApp } from '../../../src/boot';
import { For } from '../../../src/control';
import { state, type State } from '../../../src/index';
import { resource, watch } from '../../../src/resources';
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

describe('core hardening matrix', () => {
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
    const other = createTestContainer();
    let value!: State<number>;
    let unmountAndWrite!: () => void;
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
      createIsland({
        root: other.container,
        component: () => {
          const trigger = state(false);
          unmountAndWrite = () => trigger.set(true);
          watch(trigger, (fired) => {
            if (!fired) return;
            cleanupApp(container);
            value.set(1);
          });
          return null;
        },
      });
      flushScheduler();

      unmountAndWrite();
      expect(() => flushScheduler()).not.toThrow();
      expect(renders).toBe(1);
      expect(getSchedulerState().queueLength).toBe(0);
    } finally {
      other.cleanup();
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
