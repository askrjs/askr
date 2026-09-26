import { describe, expect, it, vi } from 'vite-plus/test';
import type { JSXElement } from '../../../src/jsx/types';
import { state } from '../../../src';
import {
  createDataRuntime,
  createQuery,
  createQueryCollection,
  defineQuery,
  invalidate,
  type Query,
  type QueryCollection,
} from '../../../src/data';
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

async function settleCollection(collection: {
  readonly settled: boolean;
}): Promise<void> {
  for (let attempt = 0; attempt < 10 && !collection.settled; attempt += 1) {
    await settle();
  }
}

describe('query collections', () => {
  it('should consume hydrated entries once and refetch after remount', async () => {
    const runtime = createDataRuntime();
    runtime.queryData.set('hydrated-schemas:postgres', { version: 'ssr' });
    let fetchCount = 0;
    const fetch = vi.fn(async () => {
      fetchCount += 1;
      return { version: `server-${fetchCount}` };
    });
    const schemaByDatabase = defineQuery({
      key: ({ database }: { database: string }) =>
        `hydrated-schemas:${database}`,
      fetch,
    });
    let setVisible!: (value: boolean) => void;

    const Schemas = (): JSXElement => {
      const collection = createQueryCollection({
        runtime,
        query: schemaByDatabase,
        inputs: () => [{ database: 'postgres' }],
        key: ({ database }) => database,
      });
      return <span>{collection.results.get('postgres')?.version ?? '-'}</span>;
    };

    const App = (): JSXElement => {
      const visible = state(true);
      setVisible = visible.set;
      return <div>{visible() ? <Schemas /> : null}</div>;
    };

    const { container, cleanup } = createTestContainer();
    try {
      createIsland({ root: container, component: App });
      flushScheduler();
      await settle();

      expect(container.textContent).toBe('ssr');
      expect(fetch).not.toHaveBeenCalled();
      expect(runtime.queryData.has('hydrated-schemas:postgres')).toBe(false);

      setVisible(false);
      flushScheduler();
      setVisible(true);
      flushScheduler();
      await settle();

      expect(fetch).toHaveBeenCalledTimes(1);
      expect(container.textContent).toBe('server-1');
    } finally {
      cleanup();
    }
  });

  it('should bound dynamic keyed work and aggregate query entries', async () => {
    const runtime = createDataRuntime();
    const started: string[] = [];
    const resolvers = new Map<string, (value: { database: string }) => void>();
    let active = 0;
    let maxActive = 0;
    let collection!: QueryCollection<
      { database: string },
      { database: string },
      string
    >;

    const schemaByDatabase = defineQuery({
      key: ({ database }: { database: string }) => `schemas:${database}`,
      fetch: ({ database }, { signal }) => {
        started.push(database);
        active += 1;
        maxActive = Math.max(maxActive, active);

        return new Promise<{ database: string }>((resolve, reject) => {
          const abort = () => {
            active -= 1;
            reject(new DOMException('Aborted', 'AbortError'));
          };
          signal.addEventListener('abort', abort, { once: true });
          resolvers.set(database, (value) => {
            signal.removeEventListener('abort', abort);
            active -= 1;
            resolve(value);
          });
        });
      },
    });

    const App = (): JSXElement => {
      collection = createQueryCollection({
        runtime,
        query: schemaByDatabase,
        inputs: () => [
          { database: 'postgres' },
          { database: 'analytics' },
          { database: 'warehouse' },
        ],
        key: ({ database }) => database,
        concurrency: 2,
      });

      return (
        <div>{collection.entries.map((entry) => entry.key).join(',')}</div>
      );
    };

    const { container, cleanup } = createTestContainer();
    try {
      createIsland({ root: container, component: App });
      flushScheduler();
      await settle();

      expect(container.textContent).toBe('postgres,analytics,warehouse');
      expect(started).toEqual(['postgres', 'analytics']);
      expect(maxActive).toBe(2);
      expect(collection.loading).toBe(true);
      expect(collection.settled).toBe(false);
      expect(collection.results.size).toBe(0);

      resolvers.get('postgres')?.({ database: 'postgres' });
      await settle();

      expect(started).toEqual(['postgres', 'analytics', 'warehouse']);
      expect(maxActive).toBe(2);

      resolvers.get('analytics')?.({ database: 'analytics' });
      resolvers.get('warehouse')?.({ database: 'warehouse' });
      await settle();

      expect(collection.loading).toBe(false);
      expect(collection.settled).toBe(true);
      expect([...collection.results]).toEqual([
        ['postgres', { database: 'postgres' }],
        ['analytics', { database: 'analytics' }],
        ['warehouse', { database: 'warehouse' }],
      ]);
      expect(collection.errors.size).toBe(0);
      expect(collection.get('analytics')?.query.data).toEqual({
        database: 'analytics',
      });
    } finally {
      cleanup();
    }
  });

  it('should bound invalidation refetches and mark queued entries refreshing', async () => {
    const runtime = createDataRuntime();
    const started: string[] = [];
    const finish = new Map<string, () => void>();
    let active = 0;
    let maxActive = 0;
    const attempts = new Map<string, number>();
    const query = defineQuery({
      key: (id: string) => `bounded:${id}`,
      fetch: (id: string, { signal }: { signal: AbortSignal }) => {
        const attempt = (attempts.get(id) ?? 0) + 1;
        attempts.set(id, attempt);
        if (attempt === 1) return Promise.resolve({ id, attempt });
        started.push(id);
        active += 1;
        maxActive = Math.max(maxActive, active);
        return new Promise<{ id: string; attempt: number }>(
          (resolve, reject) => {
            signal.addEventListener(
              'abort',
              () => {
                active -= 1;
                reject(new DOMException('Aborted', 'AbortError'));
              },
              { once: true }
            );
            finish.set(id, () => {
              active -= 1;
              resolve({ id, attempt });
            });
          }
        );
      },
    });
    let collection!: QueryCollection<string, { id: string; attempt: number }>;
    const App = (): JSXElement => {
      collection = createQueryCollection({
        runtime,
        query,
        inputs: () => ['a', 'b', 'c', 'd'],
        key: (id) => id,
        concurrency: 2,
      });
      return <div>{collection.entries.length}</div>;
    };
    const { container, cleanup } = createTestContainer();
    try {
      createIsland({ root: container, component: App });
      flushScheduler();
      await settleCollection(collection);
      await settle();
      invalidate('bounded:', { runtime, markPendingWrite: true });
      invalidate('bounded:c', { runtime });
      flushScheduler();

      expect(started).toEqual(['a', 'b']);
      expect(collection.get('c')?.query.refreshing).toBe(true);
      expect(collection.get('c')?.query.stale).toBe(true);
      expect(collection.get('c')?.query.consistency).toBe('pending-write');
      expect(collection.loading).toBe(true);

      invalidate('bounded:a', { runtime });
      flushScheduler();
      expect(started).toEqual(['a', 'b', 'a']);

      finish.get('a')?.();
      await settle();
      expect(started).toEqual(['a', 'b', 'a', 'c']);
      finish.get('b')?.();
      await settle();
      expect(started).toEqual(['a', 'b', 'a', 'c', 'd']);
      finish.get('c')?.();
      finish.get('d')?.();
      await settleCollection(collection);

      expect(maxActive).toBe(2);
      expect(collection.settled).toBe(true);
      expect(attempts.get('a')).toBe(3);
      expect(attempts.get('c')).toBe(2);
      expect(collection.get('d')?.query.data).toEqual({ id: 'd', attempt: 2 });
    } finally {
      cleanup();
    }
  });

  it('should use the smaller collection cap for queries shared by two collections and a plain reader', async () => {
    const runtime = createDataRuntime();
    const started: string[] = [];
    const finish = new Map<string, () => void>();
    const attempts = new Map<string, number>();
    const query = defineQuery({
      key: (id: string) => `shared-bounded:${id}`,
      fetch: (id: string) => {
        const attempt = (attempts.get(id) ?? 0) + 1;
        attempts.set(id, attempt);
        if (attempt === 1) return Promise.resolve({ id, attempt });
        started.push(id);
        return new Promise<{ id: string; attempt: number }>((resolve) => {
          finish.set(id, () => resolve({ id, attempt }));
        });
      },
    });
    let plain!: Query<{ id: string; attempt: number }>;
    let strict!: QueryCollection<string, { id: string; attempt: number }>;
    const App = (): JSXElement => {
      plain = createQuery(query, 'a', { runtime });
      createQueryCollection({
        runtime,
        query,
        inputs: () => ['a', 'b', 'c'],
        key: (id) => id,
        concurrency: 2,
      });
      strict = createQueryCollection({
        runtime,
        query,
        inputs: () => ['a', 'b', 'c'],
        key: (id) => id,
        concurrency: 1,
      });
      return <div>{strict.entries.length}</div>;
    };
    const { container, cleanup } = createTestContainer();
    try {
      createIsland({ root: container, component: App });
      flushScheduler();
      await settleCollection(strict);
      await settle();
      invalidate('shared-bounded:', { runtime });
      flushScheduler();

      expect(started).toEqual(['a']);
      expect(plain.refreshing).toBe(true);
      expect(strict.get('c')?.query.refreshing).toBe(true);

      finish.get('a')?.();
      await settle();
      expect(started).toEqual(['a', 'b']);
      finish.get('b')?.();
      await settle();
      expect(started).toEqual(['a', 'b', 'c']);
      finish.get('c')?.();
      await settleCollection(strict);
      expect(strict.settled).toBe(true);
    } finally {
      cleanup();
    }
  });

  it('should hand a queued invalidation to a remaining plain reader when its collection entry leaves', async () => {
    const runtime = createDataRuntime();
    const started: string[] = [];
    const attempts = new Map<string, number>();
    const query = defineQuery({
      key: (id: string) => `leaving:${id}`,
      fetch: (id: string, { signal }: { signal: AbortSignal }) => {
        const attempt = (attempts.get(id) ?? 0) + 1;
        attempts.set(id, attempt);
        if (attempt === 1) return Promise.resolve({ id });
        started.push(id);
        return new Promise<{ id: string }>((_resolve, reject) => {
          signal.addEventListener(
            'abort',
            () => reject(new DOMException('Aborted', 'AbortError')),
            { once: true }
          );
        });
      },
    });
    let setInputs!: (ids: readonly string[]) => void;
    let plain!: Query<{ id: string }>;
    let collection!: QueryCollection<string, { id: string }>;
    const App = (): JSXElement => {
      const inputs = state<readonly string[]>(['a', 'b']);
      setInputs = inputs.set;
      collection = createQueryCollection({
        runtime,
        query,
        inputs,
        key: (id) => id,
        concurrency: 1,
      });
      plain = createQuery(query, 'b', { runtime });
      return <div>{collection.entries.length}</div>;
    };
    const { container, cleanup } = createTestContainer();
    try {
      createIsland({ root: container, component: App });
      flushScheduler();
      await settleCollection(collection);
      await settle();
      invalidate('leaving:', { runtime });
      flushScheduler();
      expect(started).toEqual(['a']);
      expect(plain.refreshing).toBe(true);

      setInputs(['a']);
      flushScheduler();
      expect(started).toEqual(['a', 'b']);
      expect(collection.get('b')).toBeUndefined();
    } finally {
      cleanup();
    }
  });

  it('should preserve keyed entries across reorder, duplicates, invalidation, growth, and shrinkage', async () => {
    const runtime = createDataRuntime();
    const fetchCounts = new Map<string, number>();
    type DatabaseInput = { database: string };
    let setDatabases!: (value: readonly DatabaseInput[]) => void;
    let collection!: QueryCollection<
      DatabaseInput,
      { database: string },
      string
    >;

    const schemaByDatabase = defineQuery({
      key: ({ database }: DatabaseInput) => `schemas:${database}`,
      fetch: async ({ database }, { signal }) => {
        signal.throwIfAborted();
        fetchCounts.set(database, (fetchCounts.get(database) ?? 0) + 1);
        return { database };
      },
    });

    const App = (): JSXElement => {
      const databases = state<readonly DatabaseInput[]>([
        { database: 'postgres' },
        { database: 'postgres' },
        { database: 'analytics' },
      ]);
      setDatabases = databases.set;
      collection = createQueryCollection({
        runtime,
        query: schemaByDatabase,
        inputs: databases,
        key: ({ database }) => database,
        concurrency: 2,
      });

      return <div>{collection.entries.map(({ key }) => key).join(',')}</div>;
    };

    const { container, cleanup } = createTestContainer();
    try {
      createIsland({ root: container, component: App });
      flushScheduler();
      await settleCollection(collection);

      expect(container.textContent).toBe('postgres,analytics');
      expect(fetchCounts).toEqual(
        new Map([
          ['postgres', 1],
          ['analytics', 1],
        ])
      );
      const postgresQuery = collection.get('postgres')?.query;
      const analyticsQuery = collection.get('analytics')?.query;

      setDatabases([
        { database: 'analytics' },
        { database: 'postgres' },
        { database: 'analytics' },
        { database: 'warehouse' },
      ]);
      flushScheduler();
      await settleCollection(collection);

      expect(container.textContent).toBe('analytics,postgres,warehouse');
      expect(collection.get('postgres')?.query).toBe(postgresQuery);
      expect(collection.get('analytics')?.query).toBe(analyticsQuery);
      expect(fetchCounts.get('warehouse')).toBe(1);

      invalidate('schemas:analytics', { runtime });
      await settleCollection(collection);
      expect(fetchCounts.get('analytics')).toBe(2);

      setDatabases([{ database: 'warehouse' }, { database: 'analytics' }]);
      flushScheduler();

      expect(runtime.queryCache.has('schemas:postgres')).toBe(false);
      expect([...collection.results.keys()]).toEqual([
        'warehouse',
        'analytics',
      ]);
    } finally {
      cleanup();
    }
  });

  it('should share cache entries and request deduplication with createQuery', async () => {
    const runtime = createDataRuntime();
    const fetch = vi.fn(async ({ id }: { id: string }) => ({
      id,
    }));
    const userById = defineQuery({
      key: ({ id }: { id: string }) => `users:${id}`,
      fetch,
    });
    let singleQuery!: Query<{ id: string }>;
    let collection!: QueryCollection<{ id: string }, { id: string }, string>;

    const App = (): JSXElement => {
      singleQuery = createQuery(userById, { id: '123' }, { runtime });
      collection = createQueryCollection({
        runtime,
        query: userById,
        inputs: () => [{ id: '123' }],
        key: ({ id }) => id,
      });
      return <div>{collection.get('123')?.query.data?.id ?? 'loading'}</div>;
    };

    const { container, cleanup } = createTestContainer();
    try {
      createIsland({ root: container, component: App });
      flushScheduler();
      await settleCollection(collection);

      expect(fetch).toHaveBeenCalledTimes(1);
      expect(collection.get('123')?.query).toBe(singleQuery);
      expect(container.textContent).toBe('123');
    } finally {
      cleanup();
    }
  });

  it('should surface per-key errors and retry through the collection queue', async () => {
    type RetryInput = { id: string };
    const attempts = new Map<string, number>();
    const query = defineQuery({
      key: ({ id }: RetryInput) => `retry:${id}`,
      fetch: async ({ id }, { signal }) => {
        signal.throwIfAborted();
        const attempt = (attempts.get(id) ?? 0) + 1;
        attempts.set(id, attempt);
        if (id === 'failed' && attempt === 1) throw new Error('try again');
        return { id, attempt };
      },
    });
    let collection!: QueryCollection<
      RetryInput,
      { id: string; attempt: number },
      string
    >;

    const App = (): JSXElement => {
      collection = createQueryCollection({
        query,
        inputs: () => [{ id: 'failed' }, { id: 'healthy' }],
        key: ({ id }) => id,
        concurrency: 1,
      });
      return <div>{collection.errors.size}</div>;
    };

    const { container, cleanup } = createTestContainer();
    try {
      createIsland({ root: container, component: App });
      flushScheduler();
      await settleCollection(collection);

      expect(collection.errors.get('failed')).toBeInstanceOf(Error);
      expect(collection.results.get('healthy')).toEqual({
        id: 'healthy',
        attempt: 1,
      });

      const retry = collection.retry('failed');
      flushScheduler();
      await settleCollection(collection);
      await retry;

      expect(collection.errors.has('failed')).toBe(false);
      expect(collection.results.get('failed')).toEqual({
        id: 'failed',
        attempt: 2,
      });
    } finally {
      cleanup();
    }
  });

  it('should abort active work and discard queued work as keys leave or the owner unmounts', async () => {
    const started: string[] = [];
    const aborted: string[] = [];
    type LifecycleInput = { id: string };
    let setKeys!: (value: readonly LifecycleInput[]) => void;
    let collection!: QueryCollection<LifecycleInput, { id: string }, string>;

    const query = defineQuery({
      key: ({ id }: LifecycleInput) => `lifecycle:${id}`,
      fetch: ({ id }, { signal }) => {
        started.push(id);
        return new Promise<{ id: string }>((_resolve, reject) => {
          signal.addEventListener(
            'abort',
            () => {
              aborted.push(id);
              reject(new DOMException('Aborted', 'AbortError'));
            },
            { once: true }
          );
        });
      },
    });

    const App = (): JSXElement => {
      const keys = state<readonly LifecycleInput[]>([
        { id: 'first' },
        { id: 'second' },
        { id: 'third' },
      ]);
      setKeys = keys.set;
      collection = createQueryCollection({
        query,
        inputs: keys,
        key: ({ id }) => id,
        concurrency: 1,
      });
      return <div>{collection.entries.length}</div>;
    };

    const { container, cleanup } = createTestContainer();
    try {
      createIsland({ root: container, component: App });
      flushScheduler();
      await settle();
      expect(started).toEqual(['first']);

      setKeys([{ id: 'second' }, { id: 'third' }]);
      flushScheduler();
      await settle();

      expect(aborted).toEqual(['first']);
      expect(started).toEqual(['first', 'second']);

      cleanup();
      await Promise.resolve();

      expect(aborted).toEqual(['first', 'second']);
      expect(started).toEqual(['first', 'second']);
    } finally {
      cleanup();
    }
  });

  it('should pass primitive collection inputs to the fetcher', async () => {
    const fetch = vi.fn(async (id: number, _ctx: { signal: AbortSignal }) => ({
      id,
    }));
    const query = defineQuery({
      key: (id: number) => `primitive-collection:${id}`,
      fetch,
    });
    const runtime = createDataRuntime();
    let collection!: QueryCollection<number, { id: number }, number>;

    const App = (): JSXElement => {
      collection = createQueryCollection({
        runtime,
        query,
        inputs: () => [1, 2],
        key: (id) => id,
      });
      return <div>{collection.results.size}</div>;
    };

    const { container, cleanup } = createTestContainer();
    try {
      createIsland({ root: container, component: App });
      flushScheduler();
      await settleCollection(collection);

      expect(fetch.mock.calls.map(([input]) => input)).toEqual([1, 2]);
      for (const [, ctx] of fetch.mock.calls) {
        expect(ctx.signal).toBeInstanceOf(AbortSignal);
      }
      expect(collection.results.get(1)).toEqual({ id: 1 });
      expect(container.textContent).toBe('2');
    } finally {
      cleanup();
    }
  });
  it('should retry with the latest input for an unchanged query key', async () => {
    const runtime = createDataRuntime();
    const fetched: string[] = [];
    const tagged = defineQuery({
      key: ({ id }: { id: string; tag: string }) => `tagged:${id}`,
      fetch: async ({ id, tag }) => {
        fetched.push(tag);
        return { id, tag };
      },
    });
    let setTag!: (value: string) => void;
    let collection!: QueryCollection<
      { id: string; tag: string },
      { id: string; tag: string },
      string
    >;

    const App = (): JSXElement => {
      const tag = state('t1');
      setTag = tag.set;
      collection = createQueryCollection({
        runtime,
        query: tagged,
        inputs: () => [{ id: 'a', tag: tag() }],
        key: ({ id }) => id,
      });
      return <span>{collection.results.get('a')?.tag ?? '-'}</span>;
    };

    const { container, cleanup } = createTestContainer();
    try {
      createIsland({ root: container, component: App });
      flushScheduler();
      await settleCollection(collection);
      expect(fetched).toEqual(['t1']);

      setTag('t2');
      flushScheduler();
      await settle();
      expect(collection.get('a')?.input.tag).toBe('t2');

      const retried = collection.retry('a');
      flushScheduler();
      await retried;
      await settleCollection(collection);

      expect(fetched).toEqual(['t1', 't2']);
      expect(container.textContent).toBe('t2');
    } finally {
      cleanup();
    }
  });
});
