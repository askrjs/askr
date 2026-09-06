import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { createDataRuntime, createQuery, invalidate } from '../../../src/data';
import * as environment from '../../../src/common/env';
import { globalScheduler as scheduler } from '../../../src/runtime/scheduler';

afterEach(() => {
  scheduler.setBulkCommitProbe(() => false);
  scheduler.clearPendingSyncTasks();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('query work admission', () => {
  it.each(['initial', 'manual', 'invalidation'] as const)(
    'should settle cleared %s work and admits a later refresh',
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
      let settled = false;
      void pending.then(() => {
        settled = true;
      });
      scheduler.clearPendingSyncTasks();
      await Promise.resolve();
      expect(settled).toBe(true);
      expect(fetch).not.toHaveBeenCalled();
      const next = query.refresh();
      scheduler.flush();
      await next;
      expect(query.data).toEqual({ value: 2 });
      expect(fetch).toHaveBeenCalledTimes(1);
    }
  );

  it('should preserve the last snapshot when an aborted request replacement is cleared', async () => {
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
    let settled = false;
    void query.refresh().then(() => {
      settled = true;
    });
    scheduler.flush();
    expect(query.refreshing).toBe(true);
    invalidate('replacement', { runtime });
    expect(signal.aborted).toBe(true);
    scheduler.clearPendingSyncTasks();
    await Promise.resolve();
    expect(settled).toBe(true);
    expect(query.data).toEqual({ value: 1 });
    expect(query.refreshing).toBe(true);
    const next = query.refresh();
    scheduler.flush();
    await next;
    expect(query.data).toEqual({ value: 2 });
    expect(query.refreshing).toBe(false);
  });

  for (const interruption of [
    'clear',
    'reject',
    'production-reject',
  ] as const) {
    it.each(['resolve', 'reject'] as const)(
      `should ignore late %s after replacement ${interruption}`,
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
        scheduler.flush();
        if (interruption === 'clear') {
          invalidate('late', { runtime });
          scheduler.clearPendingSyncTasks();
        } else {
          if (interruption === 'production-reject') {
            vi.spyOn(environment, 'isDevelopmentEnvironment').mockReturnValue(
              false
            );
          }
          scheduler.setBulkCommitProbe(() => true);
          if (interruption === 'reject') {
            expect(() => invalidate('late', { runtime })).toThrow(
              'during bulk commit'
            );
          } else invalidate('late', { runtime });
          scheduler.setBulkCommitProbe(() => false);
        }
        await pending;
        if (outcome === 'resolve') resolve({ value: 99 });
        else reject(new Error('obsolete failure'));
        await Promise.resolve();
        await Promise.resolve();
        expect(query.data).toEqual({ value: 1 });
        expect(query.error).toBeNull();
        expect(query.refreshing).toBe(true);
      }
    );
  }

  it('should settle silently rejected production work and recovers', async () => {
    vi.spyOn(environment, 'isDevelopmentEnvironment').mockReturnValue(false);
    const fetch = vi.fn(async () => ({ value: 2 }));
    const query = createQuery({
      key: 'production',
      runtime: createDataRuntime(),
      fetch,
      skipInitialFetch: true,
    });
    scheduler.setBulkCommitProbe(() => true);
    await query.refresh();
    scheduler.setBulkCommitProbe(() => false);
    const next = query.refresh();
    scheduler.flush();
    await next;
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('should settle the shared promise when manual promotion is rejected', async () => {
    const runtime = createDataRuntime();
    const query = createQuery({
      key: 'promoted',
      runtime,
      fetch: async () => ({ value: 2 }),
      skipInitialFetch: true,
    });
    const original = query.refresh();
    invalidate('promoted', { runtime });
    vi.spyOn(environment, 'isDevelopmentEnvironment').mockReturnValue(false);
    scheduler.setBulkCommitProbe(() => true);
    const promoted = query.refresh();
    expect(promoted).toBeInstanceOf(Promise);
    await promoted;
    await original;
  });

  it('should recover after development admission rejection', async () => {
    const fetch = vi.fn(async () => ({ value: 2 }));
    const query = createQuery({
      key: 'rejected',
      runtime: createDataRuntime(),
      fetch,
      skipInitialFetch: true,
    });
    scheduler.setBulkCommitProbe(() => true);
    expect(() => query.refresh()).toThrow('during bulk commit');
    scheduler.setBulkCommitProbe(() => false);
    const next = query.refresh();
    scheduler.flush();
    expect(fetch).toHaveBeenCalledTimes(1);
    await next;
    expect(query.data).toEqual({ value: 2 });
  });

  it('should settle a refresh when its reconciliation retry is cleared', async () => {
    vi.useFakeTimers();
    const fetch = vi.fn(async () => ({ value: 2 }));
    const query = createQuery({
      key: 'reconcile',
      runtime: createDataRuntime(),
      fetch,
      skipInitialFetch: true,
      isConsistent: () => false,
      reconcile: () => true,
    });
    let settled = false;
    void query.refresh().then(() => {
      settled = true;
    });
    scheduler.flush();
    const enqueue = scheduler.enqueueInLane.bind(scheduler);
    vi.spyOn(scheduler, 'enqueueInLane').mockImplementation((lane, task) => {
      enqueue(lane, task);
      scheduler.clearPendingSyncTasks();
    });
    await vi.advanceTimersByTimeAsync(25);
    await Promise.resolve();
    expect(settled).toBe(true);
    expect(query.stale).toBe(true);
  });
});
