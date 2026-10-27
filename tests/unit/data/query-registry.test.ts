import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import {
  createDataRuntime,
  disposeDataRuntime,
} from '../../../src/data/data-runtime';
import {
  createQueryPrefetchContext,
  defineQuery,
  defineServerQueries,
  dehydrateDataRuntime,
  hydrateDataRuntime,
  prefetchQuery,
  serveQuery,
} from '../../../src/data/query-registry';
import { invalidate } from '../../../src/data/invalidation';
import { createQuery } from '../../../src/data/query-cell';
import { addInvalidationListener } from '../../../src/data/invalidation-listeners';

describe('dehydrateDataRuntime', () => {
  it.each(['__proto__', 'constructor', 'toString'])(
    'should preserve the query key %s through JSON hydration',
    (key) => {
      const runtime = createDataRuntime();
      const value = { name: 'Ada' };
      runtime.queryData.set(key, value);

      const snapshot = dehydrateDataRuntime(runtime);

      expect(Object.getPrototypeOf(snapshot)).toBe(Object.prototype);
      expect(Object.hasOwn(snapshot, key)).toBe(true);
      expect(snapshot[key]).toBe(value);
      const restored = createDataRuntime();
      hydrateDataRuntime(restored, JSON.parse(JSON.stringify(snapshot)));
      expect(restored.queryData.get(key)).toEqual(value);
    }
  );

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

  it('should retain a live joiner replacement when the aborted owner resolves last', async () => {
    const runtime = createDataRuntime();
    const owner = new AbortController();
    const old = deferred<{ v: number }>();
    const replacement = deferred<{ v: number }>();
    const fetch = vi
      .fn<() => Promise<{ v: number }>>()
      .mockReturnValueOnce(old.promise)
      .mockReturnValueOnce(replacement.promise);
    const query = defineQuery({ key: () => 'handoff', fetch });
    const first = prefetchQuery(
      createQueryPrefetchContext({ runtime, signal: owner.signal }),
      query,
      {}
    );
    const second = prefetchQuery(
      createQueryPrefetchContext({ runtime }),
      query,
      {}
    );
    owner.abort();
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    replacement.resolve({ v: 2 });
    await expect(second).resolves.toBe(true);
    old.resolve({ v: 1 });
    await expect(first).resolves.toBe(false);
    expect(runtime.queryData.get('handoff')).toEqual({ v: 2 });
    disposeDataRuntime(runtime);
  });

  it('should retire a replacement and every joiner even when both fetches ignore cancellation', async () => {
    const runtime = createDataRuntime();
    const owner = new AbortController();
    const old = deferred<{ v: number }>();
    const replacement = deferred<{ v: number }>();
    const fetch = vi
      .fn<() => Promise<{ v: number }>>()
      .mockReturnValueOnce(old.promise)
      .mockReturnValueOnce(replacement.promise);
    const query = defineQuery({ key: () => 'retired-handoff', fetch });
    const first = prefetchQuery(
      createQueryPrefetchContext({ runtime, signal: owner.signal }),
      query,
      {}
    );
    const second = prefetchQuery(
      createQueryPrefetchContext({ runtime }),
      query,
      {}
    );
    const firstResult = first.catch((error: unknown) => error);
    const secondResult = second.catch((error: unknown) => error);
    owner.abort();
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    disposeDataRuntime(runtime);
    expect(await firstResult).toMatchObject({ name: 'AbortError' });
    expect(await secondResult).toMatchObject({ name: 'AbortError' });
    old.resolve({ v: 1 });
    replacement.resolve({ v: 2 });
    await Promise.resolve();
    expect(runtime.queryData.has('retired-handoff')).toBe(false);
  });

  it('should let a live joiner replace an aborted owner after another joiner cancels', async () => {
    const runtime = createDataRuntime();
    const owner = new AbortController();
    const cancelled = new AbortController();
    const old = deferred<{ v: number }>();
    const replacement = deferred<{ v: number }>();
    const fetch = vi
      .fn<() => Promise<{ v: number }>>()
      .mockReturnValueOnce(old.promise)
      .mockReturnValueOnce(replacement.promise);
    const query = defineQuery({ key: () => 'many-joiners', fetch });
    const first = prefetchQuery(
      createQueryPrefetchContext({ runtime, signal: owner.signal }),
      query,
      {}
    );
    const leaving = prefetchQuery(
      createQueryPrefetchContext({ runtime, signal: cancelled.signal }),
      query,
      {}
    );
    const live = prefetchQuery(
      createQueryPrefetchContext({ runtime }),
      query,
      {}
    );
    const reason = new Error('joiner left');
    cancelled.abort(reason);
    await expect(leaving).rejects.toBe(reason);
    owner.abort();
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    replacement.resolve({ v: 2 });
    await expect(live).resolves.toBe(true);
    old.resolve({ v: 1 });
    await expect(first).resolves.toBe(false);
    expect(runtime.queryData.get('many-joiners')).toEqual({ v: 2 });
    disposeDataRuntime(runtime);
  });

  it('should discard a replacement invalidated while a joiner switches to it', async () => {
    const runtime = createDataRuntime();
    const owner = new AbortController();
    const old = deferred<{ v: number }>();
    const replacement = deferred<{ v: number }>();
    const fetch = vi
      .fn<() => Promise<{ v: number }>>()
      .mockReturnValueOnce(old.promise)
      .mockReturnValueOnce(replacement.promise);
    const query = defineQuery({ key: () => 'handoff-invalidated', fetch });
    const first = prefetchQuery(
      createQueryPrefetchContext({ runtime, signal: owner.signal }),
      query,
      {}
    );
    const second = prefetchQuery(
      createQueryPrefetchContext({ runtime }),
      query,
      {}
    );
    owner.abort();
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    invalidate('handoff-invalidated', { runtime });
    replacement.resolve({ v: 2 });
    old.resolve({ v: 1 });
    await expect(Promise.all([first, second])).resolves.toEqual([false, false]);
    expect(runtime.queryData.has('handoff-invalidated')).toBe(false);
    disposeDataRuntime(runtime);
  });

  it('should keep an attached query authoritative when the replacement prefetch settles', async () => {
    const runtime = createDataRuntime();
    const owner = new AbortController();
    const old = deferred<{ v: number }>();
    const replacement = deferred<{ v: number }>();
    const fetch = vi
      .fn<() => Promise<{ v: number }>>()
      .mockReturnValueOnce(old.promise)
      .mockReturnValueOnce(replacement.promise);
    const definition = defineQuery({ key: () => 'attached-handoff', fetch });
    const first = prefetchQuery(
      createQueryPrefetchContext({ runtime, signal: owner.signal }),
      definition,
      {}
    );
    const joiner = prefetchQuery(
      createQueryPrefetchContext({ runtime }),
      definition,
      {}
    );
    owner.abort();
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    const query = createQuery({
      runtime,
      key: 'attached-handoff',
      initialData: { v: 3 },
      skipInitialFetch: true,
      fetch: async () => ({ v: 4 }),
    });
    replacement.resolve({ v: 2 });
    await expect(joiner).resolves.toBe(true);
    old.resolve({ v: 1 });
    await expect(first).resolves.toBe(false);
    expect(query.data).toEqual({ v: 3 });
    expect(runtime.queryData.has('attached-handoff')).toBe(false);
    disposeDataRuntime(runtime);
  });

  it('should discard a prefetch joined during an invalidation callback', async () => {
    const runtime = createDataRuntime();
    const old = deferred<{ v: number }>();
    const fetch = vi
      .fn<() => Promise<{ v: number }>>()
      .mockReturnValueOnce(old.promise)
      .mockResolvedValueOnce({ v: 2 });
    const query = defineQuery({ key: () => 'callback-prefetch', fetch });
    const context = createQueryPrefetchContext({ runtime });
    const first = prefetchQuery(context, query, {});
    let joined!: Promise<boolean>;
    const stop = addInvalidationListener((event) => {
      if (event.prefix === 'callback-prefetch')
        joined = prefetchQuery(context, query, {});
    });
    try {
      invalidate('callback-prefetch', { runtime });
      old.resolve({ v: 1 });
      await expect(Promise.all([first, joined])).resolves.toEqual([
        false,
        false,
      ]);
      expect(runtime.queryData.has('callback-prefetch')).toBe(false);
      await expect(prefetchQuery(context, query, {})).resolves.toBe(true);
      expect(runtime.queryData.get('callback-prefetch')).toEqual({ v: 2 });
    } finally {
      stop();
      disposeDataRuntime(runtime);
    }
  });

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

  it('should not store a replaced fetch result after an invalidation', async () => {
    const runtime = createDataRuntime();
    const first = deferred<{ v: number }>();
    const replacement = deferred<{ v: number }>();
    // The fetch ignores its signal, so the aborted first fetch still settles.
    const fetch = vi
      .fn<() => Promise<{ v: number }>>()
      .mockReturnValueOnce(first.promise)
      .mockReturnValue(replacement.promise);
    const query = defineQuery({ key: () => 'replaced:1', fetch });
    const owner = new AbortController();

    const a = prefetchQuery(
      createQueryPrefetchContext({ runtime, signal: owner.signal }),
      query,
      {}
    );
    const b = prefetchQuery(createQueryPrefetchContext({ runtime }), query, {});
    owner.abort();
    const c = prefetchQuery(createQueryPrefetchContext({ runtime }), query, {});
    for (let turn = 0; turn < 10; turn += 1) await Promise.resolve();
    invalidate('replaced:', { runtime });
    replacement.resolve({ v: 2 });
    first.resolve({ v: 1 });

    await expect(Promise.all([a, b, c])).resolves.toEqual([
      false,
      false,
      false,
    ]);
    expect(runtime.queryData.has('replaced:1')).toBe(false);
  });

  it('should not let a joiner store after an invalidation that follows the owner store', async () => {
    const runtime = createDataRuntime();
    const pending = deferred<{ v: number }>();
    const query = defineQuery({
      key: () => 'late-joiner:2',
      fetch: () => pending.promise,
    });

    const a = prefetchQuery(createQueryPrefetchContext({ runtime }), query, {});
    const b = prefetchQuery(createQueryPrefetchContext({ runtime }), query, {});
    void pending.promise.then(() => invalidate('late-joiner:2', { runtime }));
    pending.resolve({ v: 1 });

    await Promise.all([a, b]);
    expect(runtime.queryData.has('late-joiner:2')).toBe(false);
  });

  it('should restart a joiner when the owner aborts a fetch that never settles', async () => {
    const runtime = createDataRuntime();
    const fetch = vi
      .fn<() => Promise<{ v: number }>>()
      .mockReturnValueOnce(new Promise(() => {}))
      .mockResolvedValue({ v: 2 });
    const query = defineQuery({ key: () => 'hung-owner:1', fetch });
    const owner = new AbortController();

    void prefetchQuery(
      createQueryPrefetchContext({ runtime, signal: owner.signal }),
      query,
      {}
    );
    const joiner = prefetchQuery(
      createQueryPrefetchContext({ runtime }),
      query,
      {}
    );
    owner.abort();

    await expect(joiner).resolves.toBe(true);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(runtime.queryData.get('hung-owner:1')).toEqual({ v: 2 });
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
