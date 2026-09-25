import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { createDataRuntime } from '../../../src/data/data-runtime';
import {
  createQueryPrefetchContext,
  defineQuery,
  defineServerQueries,
  dehydrateDataRuntime,
  prefetchQuery,
  serveQuery,
} from '../../../src/data/query-registry';
import { invalidate } from '../../../src/data/invalidation';

describe('dehydrateDataRuntime', () => {
  it('should keep JSON-compatible query data unchanged', () => {
    const runtime = createDataRuntime();
    const user = {
      id: '1',
      tags: ['a', 'b'],
      profile: { age: 3, admin: false, avatar: null },
    };
    runtime.queryData.set('user:1', user);

    expect(dehydrateDataRuntime(runtime)).toEqual({ 'user:1': user });
  });

  it.each([
    [
      'a Date',
      { createdAt: new Date(0) },
      '$.createdAt',
      'Date instances are not supported',
    ],
    ['a Map', { byId: new Map([['a', 1]]) }, '$.byId', 'Map instances'],
    ['a Set', { ids: [new Set([1])] }, '$.ids[0]', 'Set instances'],
    ['a bigint', { total: 1n }, '$.total', 'bigint is not supported'],
    ['a non-finite number', { ratio: NaN }, '$.ratio', 'non-finite numbers'],
    ['undefined', { avatar: undefined }, '$.avatar', 'undefined'],
    ['a function', { load: () => 1 }, '$.load', 'functions'],
  ])(
    'should reject %s instead of silently changing it',
    (_label, value, path, reason) => {
      const runtime = createDataRuntime();
      runtime.queryData.set('user:1', value);

      expect(() => dehydrateDataRuntime(runtime)).toThrow(TypeError);
      expect(() => dehydrateDataRuntime(runtime)).toThrow(
        `[Askr] Query data for key "user:1" at "${path}" is not JSON transport-safe: ${reason}`
      );
    }
  );

  it('should reject non-JSON SSR preload data before anything renders', async () => {
    const runtime = createDataRuntime();
    const event = defineQuery({
      key: ({ id }: { id: string }) => `event:${id}`,
      fetch: async ({ id }: { id: string }) => ({ id, at: '' }),
    });
    const context = createQueryPrefetchContext({
      runtime,
      mode: 'ssr',
      registry: defineServerQueries(
        serveQuery(event, ({ input }) => ({
          id: input.id,
          at: new Date(0) as unknown as string,
        }))
      ),
    });

    await expect(prefetchQuery(context, event, { id: '1' })).rejects.toThrow(
      '[Askr] Query data for key "event:1" at "$.at" is not JSON transport-safe: Date instances are not supported'
    );
    expect(runtime.queryData.has('event:1')).toBe(false);
  });

  it('should accept deeply nested query data without overflowing the stack', () => {
    const runtime = createDataRuntime();
    let nested: Record<string, unknown> = { leaf: true };
    for (let depth = 0; depth < 20_000; depth += 1) nested = { nested };
    runtime.queryData.set('deep:1', nested);

    expect(dehydrateDataRuntime(runtime)).toEqual({ 'deep:1': nested });
  });

  it('should reject cyclic query data', () => {
    const runtime = createDataRuntime();
    const node: Record<string, unknown> = { id: 'a' };
    node.self = node;
    runtime.queryData.set('graph:a', node);

    expect(() => dehydrateDataRuntime(runtime)).toThrow(
      '[Askr] Query data for key "graph:a" at "$.self" is not JSON transport-safe: cyclic references are not supported'
    );
  });
});

describe('SSR query prefetch without a registered handler', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const userById = defineQuery({
    key: ({ id }: { id: string }) => `user:${id}`,
    fetch: async ({ id }: { id: string }) => ({ id }),
  });

  it('should warn once per query key and runtime instead of throwing', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const runtime = createDataRuntime();
    const context = createQueryPrefetchContext({
      runtime,
      registry: defineServerQueries(),
      mode: 'ssr',
    });

    await expect(prefetchQuery(context, userById, { id: '1' })).resolves.toBe(
      false
    );
    await expect(prefetchQuery(context, userById, { id: '1' })).resolves.toBe(
      false
    );
    await expect(prefetchQuery(context, userById, { id: '2' })).resolves.toBe(
      false
    );

    expect(warn.mock.calls).toEqual([
      ['[Askr] skipped SSR query preload: user:1'],
      ['[Askr] skipped SSR query preload: user:2'],
    ]);
    expect(runtime.queryData.size).toBe(0);
  });

  it('should warn again for the same key on a different runtime', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    for (let i = 0; i < 2; i++) {
      const context = createQueryPrefetchContext({ mode: 'ssr' });
      await expect(prefetchQuery(context, userById, { id: '1' })).resolves.toBe(
        false
      );
    }
    expect(warn).toHaveBeenCalledTimes(2);
  });
});

describe('query prefetch in-flight dedupe', () => {
  function deferred<T>() {
    let resolve!: (value: T) => void;
    let reject!: (error: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  }

  it('should share one fetch between concurrent prefetches of a key', async () => {
    const runtime = createDataRuntime();
    const pending = deferred<{ id: string }>();
    const fetch = vi.fn(() => pending.promise);
    const query = defineQuery({
      key: ({ id }: { id: string }) => `dedupe:${id}`,
      fetch,
    });
    const first = createQueryPrefetchContext({ runtime });
    const second = createQueryPrefetchContext({ runtime });

    const results = Promise.all([
      prefetchQuery(first, query, { id: '1' }),
      prefetchQuery(second, query, { id: '1' }),
      prefetchQuery(first, query, { id: '1' }),
    ]);
    pending.resolve({ id: '1' });

    await expect(results).resolves.toEqual([true, true, true]);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(runtime.queryData.get('dedupe:1')).toEqual({ id: '1' });
  });

  it('should share a failed in-flight prefetch with its joiners', async () => {
    const runtime = createDataRuntime();
    const pending = deferred<{ id: string }>();
    const fetch = vi.fn(() => pending.promise);
    const query = defineQuery({
      key: ({ id }: { id: string }) => `dedupe-error:${id}`,
      fetch,
    });
    const context = createQueryPrefetchContext({ runtime });

    const first = prefetchQuery(context, query, { id: '1' });
    const second = prefetchQuery(context, query, { id: '1' });
    pending.reject(new Error('offline'));

    await expect(first).rejects.toThrow('offline');
    await expect(second).rejects.toThrow('offline');
    expect(fetch).toHaveBeenCalledTimes(1);

    fetch.mockResolvedValueOnce({ id: '1' });
    await expect(prefetchQuery(context, query, { id: '1' })).resolves.toBe(
      true
    );
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('should refetch for a live joiner when the owning prefetch is aborted', async () => {
    const runtime = createDataRuntime();
    const owner = new AbortController();
    const fetch = vi.fn(
      ({ id }: { id: string }, { signal }: { signal: AbortSignal }) =>
        new Promise<{ id: string }>((resolve, reject) => {
          if (fetch.mock.calls.length > 1) {
            resolve({ id });
            return;
          }
          signal.addEventListener('abort', () =>
            reject(new DOMException('Aborted', 'AbortError'))
          );
        })
    );
    const query = defineQuery({
      key: ({ id }: { id: string }) => `dedupe-abort:${id}`,
      fetch,
    });

    const first = prefetchQuery(
      createQueryPrefetchContext({ runtime, signal: owner.signal }),
      query,
      { id: '1' }
    );
    const second = prefetchQuery(
      createQueryPrefetchContext({ runtime }),
      query,
      { id: '1' }
    );
    // The second prefetch joined the first fetch instead of starting its own.
    expect(fetch).toHaveBeenCalledTimes(1);
    owner.abort();

    await expect(first).rejects.toThrow('Aborted');
    await expect(second).resolves.toBe(true);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(runtime.queryData.get('dedupe-abort:1')).toEqual({ id: '1' });
  });

  it('should reject a joiner promptly when its own signal aborts', async () => {
    const runtime = createDataRuntime();
    // The owner's fetch never settles and the owner cannot abort it.
    const fetch = vi.fn(() => new Promise<{ id: string }>(() => {}));
    const query = defineQuery({
      key: ({ id }: { id: string }) => `dedupe-joiner-abort:${id}`,
      fetch,
    });
    const joiner = new AbortController();
    const reason = new Error('left the page');

    void prefetchQuery(createQueryPrefetchContext({ runtime }), query, {
      id: '1',
    });
    const joined = prefetchQuery(
      createQueryPrefetchContext({ runtime, signal: joiner.signal }),
      query,
      { id: '1' }
    );
    expect(fetch).toHaveBeenCalledTimes(1);
    let settled: unknown = 'pending';
    joined.then(
      () => (settled = 'resolved'),
      (error: unknown) => (settled = error)
    );
    joiner.abort(reason);

    // The owner's fetch never settles, so only the joiner's abort can.
    for (let turn = 0; turn < 10; turn += 1) await Promise.resolve();
    expect(settled).toBe(reason);
  });

  it('should not join a fetch that started before an invalidation', async () => {
    const runtime = createDataRuntime();
    const stale = deferred<{ v: number }>();
    const fetch = vi
      .fn<() => Promise<{ v: number }>>()
      .mockReturnValueOnce(stale.promise)
      .mockResolvedValueOnce({ v: 2 });
    const query = defineQuery({ key: () => 'dedupe-invalidate:1', fetch });
    const context = createQueryPrefetchContext({ runtime });

    const before = prefetchQuery(context, query, {});
    invalidate('dedupe-invalidate:', { runtime });
    const after = prefetchQuery(context, query, {});
    await expect(after).resolves.toBe(true);
    stale.resolve({ v: 1 });

    await expect(before).resolves.toBe(false);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(runtime.queryData.get('dedupe-invalidate:1')).toEqual({ v: 2 });
  });

  it('should discard an in-flight prefetch result invalidated before it settles', async () => {
    const runtime = createDataRuntime();
    const stale = deferred<{ v: number }>();
    const query = defineQuery({
      key: () => 'prefetch-invalidated:1',
      fetch: () => stale.promise,
    });
    const other = defineQuery({
      key: () => 'prefetch-kept:1',
      fetch: async () => ({ v: 3 }),
    });
    const context = createQueryPrefetchContext({ runtime });

    const invalidated = prefetchQuery(context, query, {});
    const kept = prefetchQuery(context, other, {});
    invalidate('prefetch-invalidated:', { runtime });
    stale.resolve({ v: 1 });

    await expect(invalidated).resolves.toBe(false);
    await expect(kept).resolves.toBe(true);
    expect(runtime.queryData.has('prefetch-invalidated:1')).toBe(false);
    expect(runtime.queryData.get('prefetch-kept:1')).toEqual({ v: 3 });
  });

  it('should keep separate runtimes independent', async () => {
    const fetch = vi.fn(async ({ id }: { id: string }) => ({ id }));
    const query = defineQuery({
      key: ({ id }: { id: string }) => `dedupe-runtime:${id}`,
      fetch,
    });

    await Promise.all([
      prefetchQuery(
        createQueryPrefetchContext({ runtime: createDataRuntime() }),
        query,
        { id: '1' }
      ),
      prefetchQuery(
        createQueryPrefetchContext({ runtime: createDataRuntime() }),
        query,
        { id: '1' }
      ),
    ]);

    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
