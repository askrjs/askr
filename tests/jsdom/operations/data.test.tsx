import { describe, expect, it, vi } from 'vite-plus/test';
import type { JSXElement } from '../../../src/jsx/types';
import { createQuery, createMutation, invalidate } from '../../../src/data';
import { createIsland } from '../../../test-utils/render/create-island';
import {
  createTestContainer,
  flushScheduler,
  waitForNextEvaluation,
} from '../../../test-utils/render/test-renderer';

async function settle(): Promise<void> {
  await waitForNextEvaluation();
  flushScheduler();
}

describe('data layer', () => {
  it('should share query instances by key and update all readers', async () => {
    let resolveUser!: (value: { name: string }) => void;
    const loadUser = vi.fn(
      () =>
        new Promise<{ name: string }>((resolve) => {
          resolveUser = resolve;
        })
    );

    const UserCard = ({ label }: { label: string }): JSXElement => {
      const query = createQuery({
        key: 'users:123',
        fetch: loadUser,
      });

      return (
        <div data-label={label} data-state={query.consistency}>
          {query.data?.name ?? (query.loading ? 'loading' : 'empty')}
        </div>
      );
    };

    const App = (): JSXElement => (
      <section>
        <UserCard label="a" />
        <UserCard label="b" />
      </section>
    );

    const { container, cleanup } = createTestContainer();
    try {
      createIsland({ root: container, component: App });
      flushScheduler();
      await settle();

      expect(loadUser).toHaveBeenCalledTimes(1);
      expect(container.textContent).toBe('loadingloading');

      resolveUser({ name: 'Ada' });
      await settle();

      expect(container.textContent).toBe('AdaAda');
    } finally {
      cleanup();
    }
  });

  it('should keep the last value visible while prefix invalidation refreshes', async () => {
    let resolveFirst!: (value: string) => void;
    let resolveSecond!: (value: string) => void;
    let callCount = 0;

    const App = (): JSXElement => {
      const query = createQuery({
        key: 'users:list',
        fetch: async () => {
          callCount += 1;
          return callCount === 1
            ? new Promise<string>((resolve) => {
                resolveFirst = resolve;
              })
            : new Promise<string>((resolve) => {
                resolveSecond = resolve;
              });
        },
      });

      return (
        <div>
          {query.data ?? 'empty'}|{query.consistency}|
          {query.refreshing ? 'r' : 's'}
        </div>
      );
    };

    const { container, cleanup } = createTestContainer();
    try {
      createIsland({ root: container, component: App });
      flushScheduler();
      await settle();

      expect(container.textContent).toBe('empty|fresh|s');

      resolveFirst('first');
      await settle();
      expect(container.textContent).toBe('first|fresh|s');

      invalidate('users:');
      flushScheduler();
      await settle();
      expect(container.textContent).toBe('first|refreshing|r');

      resolveSecond('second');
      await settle();
      expect(container.textContent).toBe('second|fresh|s');
    } finally {
      cleanup();
    }
  });

  it('should mark affected queries pending-write after a successful mutation', async () => {
    let resolveInitial!: (value: { id: string; version: number }) => void;
    let resolveRefresh!: (value: { id: string; version: number }) => void;
    let userVersion = 1;
    let queryCalls = 0;

    const saveUser = createMutation({
      action: async (name: string) => {
        userVersion += 1;
        return { id: '123', name, version: userVersion };
      },
      affects: () => ['user:123'],
      afterSuccess: 'invalidate',
    });

    const App = (): JSXElement => {
      const query = createQuery({
        key: 'user:123',
        fetch: async () => {
          queryCalls += 1;
          return queryCalls === 1
            ? new Promise<{ id: string; version: number }>((resolve) => {
                resolveInitial = resolve;
              })
            : new Promise<{ id: string; version: number }>((resolve) => {
                resolveRefresh = resolve;
              });
        },
        isConsistent: (data) => data.version >= userVersion,
      });

      return (
        <button onClick={() => void saveUser.execute('Grace')}>
          {saveUser.pending
            ? 'Saving'
            : query.consistency === 'pending-write'
              ? 'Saved, syncing...'
              : query.data
                ? `Saved v${query.data.version}`
                : 'Loading'}
        </button>
      );
    };

    const { container, cleanup } = createTestContainer();
    try {
      createIsland({ root: container, component: App });
      flushScheduler();
      await settle();

      expect(container.textContent).toBe('Loading');

      resolveInitial({ id: '123', version: 1 });
      await settle();
      expect(container.textContent).toBe('Saved v1');

      (container.firstElementChild as HTMLButtonElement).click();
      flushScheduler();
      await settle();

      expect(container.textContent).toBe('Saved, syncing...');
      expect(saveUser.status).toBe('success');
      expect(saveUser.result).toEqual({ id: '123', name: 'Grace', version: 2 });

      resolveRefresh({ id: '123', version: 2 });
      await settle();

      expect(container.textContent).toBe('Saved v2');
    } finally {
      cleanup();
    }
  });
});
