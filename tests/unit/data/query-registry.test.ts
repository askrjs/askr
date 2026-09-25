import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { createDataRuntime } from '../../../src/data/data-runtime';
import {
  createQueryPrefetchContext,
  defineQuery,
  defineServerQueries,
  prefetchQuery,
} from '../../../src/data/query-registry';

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
    owner.abort();

    await expect(first).rejects.toThrow('Aborted');
    await expect(second).resolves.toBe(true);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(runtime.queryData.get('dedupe-abort:1')).toEqual({ id: '1' });
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
