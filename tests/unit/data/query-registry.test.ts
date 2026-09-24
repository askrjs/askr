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
