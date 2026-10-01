import { describe, expect, it, vi } from 'vite-plus/test';
import {
  createDataRuntime,
  createQuery,
  invalidate,
  type Query,
} from '../../../src/data';
import { createIsland } from '../../../test-utils/render/create-island';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';

async function settle(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  flushScheduler();
  await Promise.resolve();
}

describe('retained query cleanup', () => {
  it('should settle an aborted refresh before a retained query is remounted', async () => {
    vi.useFakeTimers();
    const runtime = createDataRuntime();
    const requests: Array<{
      signal: AbortSignal;
      resolve: (value: { name: string }) => void;
    }> = [];
    const fetch = vi.fn(
      ({ signal }: { signal: AbortSignal }) =>
        new Promise<{ name: string }>((resolve) => {
          requests.push({ signal, resolve });
        })
    );
    const first = createTestContainer();
    const second = createTestContainer();
    let query!: Query<{ name: string }>;
    const component = () => {
      query = createQuery({
        key: 'retained:active',
        fetch,
        initialData: { name: 'Seed' },
        gcTime: 50,
        runtime,
      });
      return <div>{query.refreshing ? 'refreshing' : query.data?.name}</div>;
    };

    try {
      createIsland({ root: first.container, component });
      flushScheduler();
      const refresh = query.refresh();
      flushScheduler();
      expect(query.refreshing).toBe(true);

      first.cleanup();
      await refresh;
      expect(requests[0]?.signal.aborted).toBe(true);
      expect(runtime.queryCache.has('retained:active')).toBe(true);

      createIsland({ root: second.container, component });
      flushScheduler();

      expect(fetch).toHaveBeenCalledTimes(1);
      expect({
        data: query.data,
        refreshing: query.refreshing,
        consistency: query.consistency,
        staleReason: query.staleReason,
      }).toEqual({
        data: { name: 'Seed' },
        refreshing: false,
        consistency: 'stale',
        staleReason: 'aborted',
      });
      expect(second.container.textContent).toBe('Seed');

      requests[0]!.resolve({ name: 'Obsolete' });
      await settle();
      expect(query.data).toEqual({ name: 'Seed' });

      const nextRefresh = query.refresh();
      flushScheduler();
      requests[1]!.resolve({ name: 'Updated' });
      await nextRefresh;
      await settle();
      expect(query.consistency).toBe('fresh');
      expect(second.container.textContent).toBe('Updated');
    } finally {
      first.cleanup();
      second.cleanup();
      vi.advanceTimersByTime(50);
      vi.useRealTimers();
    }
  });

  it.each(['refresh', 'invalidation'] as const)(
    'should cancel a queued %s when the last reader leaves',
    async (kind) => {
      vi.useFakeTimers();
      const runtime = createDataRuntime();
      const fetch = vi.fn(async () => ({ name: 'Updated' }));
      const first = createTestContainer();
      const second = createTestContainer();
      let query!: Query<{ name: string }>;
      const component = () => {
        query = createQuery({
          key: 'retained:queued',
          fetch,
          initialData: { name: 'Seed' },
          gcTime: 50,
          runtime,
        });
        return <div>{query.data?.name}</div>;
      };

      try {
        createIsland({ root: first.container, component });
        flushScheduler();
        let refresh: Promise<void> | undefined;
        if (kind === 'refresh') {
          refresh = query.refresh();
        } else {
          invalidate('retained:queued', { runtime, markPendingWrite: true });
          expect(query.consistency).toBe('pending-write');
        }
        first.cleanup();
        await refresh;
        flushScheduler();
        await settle();

        expect(fetch).not.toHaveBeenCalled();
        expect(runtime.queryCache.has('retained:queued')).toBe(true);
        createIsland({ root: second.container, component });
        flushScheduler();
        expect(query.refreshing).toBe(false);
        expect(query.consistency).toBe(kind === 'refresh' ? 'fresh' : 'stale');
        expect(query.staleReason).toBe(kind === 'refresh' ? null : 'aborted');
        expect(second.container.textContent).toBe('Seed');

        const nextRefresh = query.refresh();
        flushScheduler();
        await nextRefresh;
        await settle();
        expect(fetch).toHaveBeenCalledTimes(1);
        expect(second.container.textContent).toBe('Updated');
      } finally {
        first.cleanup();
        second.cleanup();
        vi.advanceTimersByTime(50);
        vi.useRealTimers();
      }
    }
  );
});
