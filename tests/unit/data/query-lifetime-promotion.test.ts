import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import {
  QueryLifetime,
  type QueryLifetimeWork,
} from '../../../src/data/query-lifetime';
import type { QueryCellOptions } from '../../../src/data/query-lifetime';

describe('QueryLifetime definition promotion', () => {
  afterEach(() => vi.useRealTimers());

  it('should promote the next live reader definition when the defining hook detaches', () => {
    vi.useFakeTimers();
    const firstGeneration = {};
    const secondGeneration = {};
    const firstFetch = vi.fn(async () => 'first');
    const secondFetch = vi.fn(async () => 'second');
    const first: QueryCellOptions<string> = {
      key: 'promotion',
      fetch: firstFetch,
      gcTime: 50,
    };
    const second: QueryCellOptions<string> = {
      key: 'promotion',
      fetch: secondFetch,
      gcTime: 50,
    };
    const work: QueryLifetimeWork<string> = {
      snapshot: () => ({
        data: 'cached',
        error: null,
        loading: false,
        refreshing: false,
        stale: false,
        consistency: 'fresh',
        staleReason: null,
      }),
      retireInactiveFetch: () => null,
      markRetainedAborted: () => {},
      destroyFetch: () => {},
      finishPendingRefresh: () => {},
    };
    const cache = new Map<string, unknown>();
    const identity = {};
    const lifetime = new QueryLifetime(
      first,
      'promotion',
      cache,
      identity,
      work
    );
    cache.set('promotion', identity);

    lifetime.attach(firstGeneration, 0);
    lifetime.define(first, firstGeneration, 0);
    lifetime.attach(secondGeneration, 0);
    lifetime.define(second, secondGeneration, 0);
    expect(lifetime.currentOptions.fetch).toBe(firstFetch);

    lifetime.detach(firstGeneration, 0);

    expect(lifetime.readerCount).toBe(1);
    expect(lifetime.currentOptions.fetch).toBe(secondFetch);
    expect(lifetime.isDestroyed).toBe(false);

    lifetime.destroy();
  });
});
