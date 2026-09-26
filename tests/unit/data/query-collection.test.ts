import { describe, expect, it, vi } from 'vite-plus/test';
import {
  createQueryCollection,
  normalizeQueryCollectionConcurrency,
} from '../../../src/data/query-collection';
import { createDataRuntime } from '../../../src/data/data-runtime';
import {
  createQueryPrefetchContext,
  defineQuery,
  defineServerQueries,
  dehydrateDataRuntime,
  hydrateDataRuntime,
  prefetchQuery,
  serveQuery,
} from '../../../src/data/query-registry';
import { renderToStringSync } from '../../../src/ssr';

describe('query collection concurrency', () => {
  it('should use a bounded default and accept positive integers', () => {
    expect(normalizeQueryCollectionConcurrency(undefined)).toBe(4);
    expect(normalizeQueryCollectionConcurrency(1)).toBe(1);
    expect(normalizeQueryCollectionConcurrency(8)).toBe(8);
  });

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    'should reject invalid concurrency %s',
    (concurrency) => {
      expect(() => normalizeQueryCollectionConcurrency(concurrency)).toThrow(
        '[Askr] createQueryCollection() concurrency must be a positive integer.'
      );
    }
  );

  it('should consume hydrated data without starting fetches during SSR', () => {
    const runtime = createDataRuntime();
    runtime.queryData.set('ssr-schema:postgres', { database: 'postgres' });
    const fetch = vi.fn(async ({ database }: { database: string }) => ({
      database,
    }));
    const query = defineQuery({
      key: ({ database }: { database: string }) => `ssr-schema:${database}`,
      fetch,
    });

    const html = renderToStringSync(() => {
      const collection = createQueryCollection({
        runtime,
        query,
        inputs: () => [{ database: 'postgres' }],
        key: ({ database }) => database,
      });
      return collection.results.get('postgres')?.database ?? 'loading';
    });

    expect(html).toContain('postgres');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('should keep every prefetched entry when building a server payload', async () => {
    const runtime = createDataRuntime();
    const context = createQueryPrefetchContext({ runtime });
    const query = defineQuery({
      key: ({ id }: { id: number }) => `payload:${id}`,
      fetch: async ({ id }: { id: number; signal: AbortSignal }) => ({ id }),
    });

    for (let id = 0; id < 200; id += 1) {
      await prefetchQuery(context, query, { id });
    }

    expect(Object.keys(dehydrateDataRuntime(runtime))).toHaveLength(200);
  });

  it('should prefetch and hydrate into a hand-built data runtime', async () => {
    const runtime = {
      queryCache: new Map<string, unknown>(),
      queryData: new Map<string, unknown>(),
    };
    const query = defineQuery({
      key: ({ id }: { id: number }) => `plain:${id}`,
      fetch: async ({ id }: { id: number; signal: AbortSignal }) => ({ id }),
    });
    const registry = defineServerQueries(
      serveQuery(query, ({ input }) => ({ id: input.id }))
    );

    await prefetchQuery(
      createQueryPrefetchContext({ runtime, mode: 'ssr', registry }),
      query,
      { id: 1 }
    );
    await prefetchQuery(createQueryPrefetchContext({ runtime }), query, {
      id: 2,
    });
    hydrateDataRuntime(runtime, { 'plain:3': { id: 3 } });

    expect(dehydrateDataRuntime(runtime)).toEqual({
      'plain:1': { id: 1 },
      'plain:2': { id: 2 },
      'plain:3': { id: 3 },
    });
  });
});
