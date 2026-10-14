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

describe('query generation authority across user callbacks', () => {
  it('should skip an obsolete start when aborting its predecessor creates newer invalidation work', async () => {
    const runtime = createDataRuntime();
    const fetch = vi.fn(async ({ signal }: { signal: AbortSignal }) => {
      if (fetch.mock.calls.length === 1) {
        signal.addEventListener('abort', () =>
          invalidate('start-abort-callback', { runtime })
        );
      }
      return { value: fetch.mock.calls.length };
    });
    const query = createQuery({
      key: 'start-abort-callback',
      runtime,
      initialData: { value: 0 },
      fetch,
    });
    const initial = query.refresh();
    flushSync();
    await initial;
    expect(query.data).toEqual({ value: 1 });

    const pending = query.refresh();
    flushSync();
    await pending;
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(query.data).toEqual({ value: 2 });
  });

  it('should preserve newer invalidation work created by a reconciliation abort listener', async () => {
    vi.useFakeTimers();
    const runtime = createDataRuntime();
    const signals: AbortSignal[] = [];
    const fetch = vi.fn(async ({ signal }: { signal: AbortSignal }) => {
      signals.push(signal);
      if (signals.length === 1) {
        signal.addEventListener('abort', () =>
          invalidate('abort-callback', { runtime })
        );
      }
      return { value: signals.length };
    });
    const query = createQuery({
      key: 'abort-callback',
      runtime,
      initialData: { value: 0 },
      fetch,
      isConsistent: (data) => data.value >= 3,
      reconcile: async () => true,
    });

    const pending = query.refresh();
    flushSync();
    await vi.advanceTimersByTimeAsync(25);
    flushSync();
    await vi.advanceTimersByTimeAsync(25);
    flushSync();
    await Promise.resolve();

    expect(fetch).toHaveBeenCalledTimes(3);
    await pending;
    expect(query.data).toEqual({ value: 3 });
    expect(query.consistency).toBe('fresh');
    expect(signals[2].aborted).toBe(false);
  });

  it('should ignore a consistency error after its replacement work is canceled', async () => {
    const runtime = createDataRuntime();
    const query = createQuery({
      key: 'callback-canceled',
      runtime,
      initialData: { value: 1 },
      fetch: async () => ({ value: 99 }),
      isConsistent: () => {
        invalidate('callback-canceled', { runtime });
        clearScheduler();
        throw new Error('obsolete consistency error');
      },
    });

    const pending = query.refresh();
    flushSync();
    await pending;
    await Promise.resolve();

    expect(query.data).toEqual({ value: 1 });
    expect(query.error).toBeNull();
  });

  it.each(['consistent', 'inconsistent', 'throw'] as const)(
    'should ignore an obsolete %s result when its consistency callback invalidates the query',
    async (outcome) => {
      const runtime = createDataRuntime();
      const requests: Array<{
        signal: AbortSignal;
        resolve: (data: { value: number }) => void;
      }> = [];
      const reconcile = vi.fn(async () => false);
      const fetch = vi.fn(
        ({ signal }: { signal: AbortSignal }) =>
          new Promise<{ value: number }>((resolve) => {
            requests.push({ signal, resolve });
          })
      );
      const query = createQuery({
        key: 'callback-race',
        runtime,
        initialData: { value: 1 },
        fetch,
        reconcile,
        isConsistent: (data) => {
          if (data.value !== 99) return true;
          invalidate('callback-race', { runtime });
          if (outcome === 'throw') throw new Error('obsolete callback failed');
          return outcome === 'consistent';
        },
      });

      const pending = query.refresh();
      flushSync();
      expect(requests).toHaveLength(1);
      requests[0].resolve({ value: 99 });
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();

      expect(requests).toHaveLength(2);
      expect(requests[0].signal.aborted).toBe(true);
      expect(requests[1].signal.aborted).toBe(false);
      expect(query.data).toEqual({ value: 1 });
      expect(query.error).toBeNull();
      expect(reconcile).not.toHaveBeenCalled();

      requests[1].resolve({ value: 2 });
      await pending;
      expect(query.data).toEqual({ value: 2 });
      expect(query.error).toBeNull();
      expect(requests[1].signal.aborted).toBe(false);
    }
  );
});
