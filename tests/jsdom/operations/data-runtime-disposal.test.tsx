import { afterEach, expect, it, vi } from 'vite-plus/test';
import {
  createDataRuntime,
  createMutation,
  createQuery,
  createQueryCollection,
  defineQuery,
  disposeDataRuntime,
  invalidateOnInterval,
  refreshOnActivity,
  type Mutation,
  type Query,
  type QueryCollection,
} from '../../../src/data';
import { createIsland } from '../../../test-utils/render/create-island';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';

async function settle(): Promise<void> {
  for (let index = 0; index < 12; index += 1) await Promise.resolve();
  flushScheduler();
}

afterEach(() => vi.useRealTimers());

it.each(['entries', 'membership'] as const)(
  'should clear mounted %s-only collection content without query getter subscriptions',
  async (observation) => {
    const runtime = createDataRuntime();
    const definition = defineQuery({
      key: (id: number) => `entries:${id}`,
      fetch: () => new Promise<{}>(() => {}),
    });
    const fixture = createTestContainer();
    try {
      createIsland({
        root: fixture.container,
        component: () => {
          const collection = createQueryCollection({
            runtime,
            query: definition,
            inputs: () => [1, 2],
            key: (id) => id,
            concurrency: 1,
          });
          return observation === 'entries' ? (
            <span>
              {collection.entries.length}:
              {collection.entries.map(({ key }) => key).join(',')}
            </span>
          ) : (
            <span>{collection.get(1) ? 'present' : 'missing'}</span>
          );
        },
      });
      flushScheduler();
      expect(fixture.container.textContent).toBe(
        observation === 'entries' ? '2:1,2' : 'present'
      );
      disposeDataRuntime(runtime);
      await settle();
      expect(fixture.container.textContent).toBe(
        observation === 'entries' ? '0:' : 'missing'
      );
    } finally {
      fixture.cleanup();
      disposeDataRuntime(runtime);
    }
  }
);

it('should stop active and queued collection work, retire retained entries, and allow later cleanup', async () => {
  const runtime = createDataRuntime();
  const signals: AbortSignal[] = [];
  let resolve!: (value: { id: number }) => void;
  const fetch = vi.fn((_: number, context: { signal: AbortSignal }) => {
    signals.push(context.signal);
    return new Promise<{ id: number }>((done) => {
      resolve = done;
    });
  });
  const definition = defineQuery({
    key: (id: number) => `collection:${id}`,
    fetch,
  });
  let collection!: QueryCollection<number, { id: number }, number>;
  const fixture = createTestContainer();
  try {
    createIsland({
      root: fixture.container,
      component: () => {
        collection = createQueryCollection({
          runtime,
          query: definition,
          inputs: () => [1, 2, 3],
          key: (id) => id,
          concurrency: 1,
        });
        return <span>{collection.results.size}</span>;
      },
    });
    flushScheduler();
    expect(fetch).toHaveBeenCalledTimes(1);
    const entries = collection.entries;
    const queued = collection.retry(2);
    disposeDataRuntime(runtime);
    expect(signals[0].aborted).toBe(true);
    expect(entries.every(({ query }) => query.data === null)).toBe(true);
    expect(
      entries.every(
        ({ query }) =>
          query.error instanceof Error && query.error.name === 'AbortError'
      )
    ).toBe(true);
    await queued;
    resolve({ id: 99 });
    await settle();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(collection.results.size).toBe(0);
    expect(collection.loading).toBe(false);
    expect(() => collection.retry(1)).toThrow(/disposed/i);
    expect(() => fixture.cleanup()).not.toThrow();
    expect(() => disposeDataRuntime(runtime)).not.toThrow();
  } finally {
    fixture.cleanup();
  }
});

it('should erase active readers and mutations, keep old activity callbacks inert, and leave listeners component-owned', async () => {
  vi.useFakeTimers();
  const runtime = createDataRuntime();
  const survivor = createDataRuntime();
  const liveFetch = vi.fn(async () => ({ secret: 'live refresh' }));
  const fetch = vi.fn(async () => ({ secret: 'fresh' }));
  const removed = vi.spyOn(window, 'removeEventListener');
  let query!: Query<{ secret: string }>;
  let mutation!: Mutation<void, string>;
  const fixture = createTestContainer();
  const liveFixture = createTestContainer();
  try {
    createIsland({
      root: liveFixture.container,
      component: () => {
        const live = createQuery({
          runtime: survivor,
          key: 'activity:1',
          initialData: { secret: 'survivor' },
          fetch: liveFetch,
        });
        refreshOnActivity('activity:', {
          runtime: survivor,
          staleTimeMs: 'always',
        });
        invalidateOnInterval('activity:', {
          runtime: survivor,
          intervalMs: 10,
        });
        return <span>{live.data?.secret}</span>;
      },
    });
    createIsland({
      root: fixture.container,
      component: () => {
        query = createQuery({
          runtime,
          key: 'activity:1',
          initialData: { secret: 'old' },
          fetch,
        });
        mutation = createMutation({
          runtime,
          action: async () => 'old result',
        });
        refreshOnActivity('activity:', { runtime, staleTimeMs: 'always' });
        invalidateOnInterval('activity:', { runtime, intervalMs: 10 });
        return <span>{query.data?.secret ?? 'retired'}</span>;
      },
    });
    flushScheduler();
    await mutation.execute(undefined);
    await settle();
    const oldQuery = query;
    const oldMutation = mutation;
    const beforeDispose = removed.mock.calls.length;
    disposeDataRuntime(runtime);
    expect(removed.mock.calls.length).toBe(beforeDispose);
    expect(mutation.result).toBeNull();
    window.dispatchEvent(new Event('focus'));
    window.dispatchEvent(new Event('online'));
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(100);
    await settle();
    expect(fetch).not.toHaveBeenCalled();
    expect(query.data).toBeNull();
    expect(query).toBe(oldQuery);
    expect(mutation).toBe(oldMutation);
    expect(fixture.container.textContent).toBe('retired');
    expect(liveFetch).toHaveBeenCalled();
    expect(liveFixture.container.textContent).toBe('live refresh');
    fixture.cleanup();
    expect(removed.mock.calls.some(([name]) => name === 'focus')).toBe(true);
    expect(() => disposeDataRuntime(runtime)).not.toThrow();
  } finally {
    fixture.cleanup();
    liveFixture.cleanup();
    disposeDataRuntime(survivor);
    removed.mockRestore();
  }
});

it('should retire an ownerless reader after its actual cache window expires', async () => {
  vi.useFakeTimers();
  const runtime = createDataRuntime();
  const query = createQuery({
    runtime,
    key: 'evicted',
    gcTime: 5,
    initialData: { secret: 'retained' },
    fetch: async () => ({ secret: 'new' }),
  });
  await vi.advanceTimersByTimeAsync(5);
  expect(runtime.queryCache.size).toBe(0);
  expect(query.data).toEqual({ secret: 'retained' });
  disposeDataRuntime(runtime);
  expect(query.data).toBeNull();
  expect(query.error).toMatchObject({ name: 'AbortError' });
  expect(() => query.refresh()).toThrow(/disposed/i);
});
