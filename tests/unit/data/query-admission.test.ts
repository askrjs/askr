import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { createDataRuntime, createQuery, invalidate } from '../../../src/data';
import {
  clearScheduler,
  flushSync,
} from '../../../src/core/reactive/scheduler';

afterEach(() => {
  clearScheduler();
  vi.useRealTimers();
});

describe('query work admission', () => {
  it.each(['resolve', 'reject'] as const)(
    'should ignore a queued %s as soon as invalidation supersedes it',
    async (outcome) => {
      const runtime = createDataRuntime();
      let resolve!: (value: { value: number }) => void;
      let reject!: (reason: Error) => void;
      const fetch = vi.fn(() => {
        if (fetch.mock.calls.length > 1) {
          return new Promise<{ value: number }>(() => {});
        }
        return new Promise<{ value: number }>((res, rej) => {
          resolve = res;
          reject = rej;
        });
      });
      const query = createQuery({
        key: 'queued-settlement',
        runtime,
        initialData: { value: 1 },
        fetch,
        gcTime: 0,
      });
      const refresh = query.refresh();
      flushSync();
      await Promise.resolve();

      // Queue the old promise continuation ahead of the scheduler's
      // replacement start. Cancellation must revoke it synchronously.
      if (outcome === 'resolve') resolve({ value: 99 });
      else reject(new Error('obsolete failure'));
      invalidate('queued-settlement', { runtime });
      await Promise.resolve();
      await Promise.resolve();

      expect(query.data).toEqual({ value: 1 });
      expect(query.error).toBeNull();
      expect(fetch).toHaveBeenCalledTimes(2);
      clearScheduler();
      // A final cleared replacement settles the shared refresh handle.
      invalidate('queued-settlement', { runtime });
      clearScheduler();
      await refresh;
    }
  );

  it.each(['initial', 'manual', 'invalidation'] as const)(
    'should settle cleared %s work and admit a later refresh',
    async (kind) => {
      const runtime = createDataRuntime();
      const fetch = vi.fn(async () => ({ value: 2 }));
      const query = createQuery({
        key: 'admission',
        runtime,
        fetch,
        skipInitialFetch: kind !== 'initial',
      });
      if (kind === 'invalidation') invalidate('admission', { runtime });

      const pending = query.refresh();
      clearScheduler();
      await pending;
      expect(fetch).not.toHaveBeenCalled();

      const next = query.refresh();
      flushSync();
      await next;
      expect(query.data).toEqual({ value: 2 });
      expect(fetch).toHaveBeenCalledTimes(1);
    }
  );

  it('should preserve the last snapshot when an aborted replacement is cleared', async () => {
    const runtime = createDataRuntime();
    let signal!: AbortSignal;
    const fetch = vi.fn(({ signal: nextSignal }: { signal: AbortSignal }) => {
      signal = nextSignal;
      return fetch.mock.calls.length === 1
        ? new Promise<{ value: number }>(() => {})
        : Promise.resolve({ value: 2 });
    });
    const query = createQuery({
      key: 'replacement',
      runtime,
      fetch,
      initialData: { value: 1 },
    });

    const pending = query.refresh();
    flushSync();
    expect(query.refreshing).toBe(true);
    invalidate('replacement', { runtime });
    expect(signal.aborted).toBe(true);
    clearScheduler();
    await pending;
    expect(query.data).toEqual({ value: 1 });

    const next = query.refresh();
    flushSync();
    await next;
    expect(query.data).toEqual({ value: 2 });
    expect(query.refreshing).toBe(false);
  });

  it.each(['resolve', 'reject'] as const)(
    'should ignore a late %s after a replacement is cleared',
    async (outcome) => {
      const runtime = createDataRuntime();
      let resolve!: (value: { value: number }) => void;
      let reject!: (reason: Error) => void;
      const query = createQuery({
        key: 'late',
        runtime,
        initialData: { value: 1 },
        fetch: () =>
          new Promise<{ value: number }>((res, rej) => {
            resolve = res;
            reject = rej;
          }),
      });

      const pending = query.refresh();
      flushSync();
      invalidate('late', { runtime });
      clearScheduler();
      await pending;

      if (outcome === 'resolve') resolve({ value: 99 });
      else reject(new Error('obsolete failure'));
      await Promise.resolve();
      await Promise.resolve();
      expect(query.data).toEqual({ value: 1 });
      expect(query.error).toBeNull();
    }
  );
});
