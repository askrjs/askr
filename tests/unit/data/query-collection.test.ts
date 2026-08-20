import { describe, expect, it, vi } from 'vite-plus/test';
import {
  createQueryCollection,
  normalizeQueryCollectionConcurrency,
} from '../../../src/data/query-collection';
import { createDataRuntime } from '../../../src/data/data-runtime';
import { defineQuery } from '../../../src/data/query-registry';
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
});
