import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import {
  createDataRuntime,
  createMutation,
  createQuery,
  createQueryPrefetchContext,
  defineQuery,
  defineServerQueries,
  dehydrateDataRuntime,
  disposeDataRuntime,
  getDefaultDataRuntime,
  hydrateDataRuntime,
  invalidate,
  serveQuery,
} from '../../../src/data';
import {
  clearScheduler,
  flushSync,
} from '../../../src/core/reactive/scheduler';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

async function microtasks(): Promise<void> {
  for (let index = 0; index < 12; index += 1) await Promise.resolve();
}

afterEach(() => {
  clearScheduler();
  vi.useRealTimers();
});

describe('terminal isolated data runtime disposal', () => {
  it('should expose terminal readers before prefetch abort callbacks run and preserve a same-key survivor', async () => {
    const runtime = createDataRuntime();
    const survivor = createDataRuntime();
    const old = createQuery({
      runtime,
      key: 'same',
      initialData: { secret: 'old' },
      fetch: async () => ({ secret: 'old' }),
    });
    const live = createQuery({
      runtime: survivor,
      key: 'same',
      initialData: { secret: 'survivor' },
      fetch: async () => ({ secret: 'fresh' }),
    });
    const mutation = createMutation({ runtime, action: async () => 'old' });
    await mutation.execute(undefined);
    const caller = new AbortController();
    const context = createQueryPrefetchContext({
      runtime,
      signal: caller.signal,
    });
    const seen = vi.fn(() => {
      expect(old.data).toBeNull();
      expect(old.error).toMatchObject({ name: 'AbortError' });
      expect([mutation.status, mutation.result]).toEqual(['idle', null]);
      expect(live.data).toEqual({ secret: 'survivor' });
    });
    context.signal.addEventListener('abort', seen);
    disposeDataRuntime(runtime);
    expect(seen).toHaveBeenCalledTimes(1);
    expect(caller.signal.aborted).toBe(false);
    expect(context.signal.aborted).toBe(true);
    const refreshed = live.refresh();
    flushSync();
    await refreshed;
    expect(live.data).toEqual({ secret: 'fresh' });
    disposeDataRuntime(survivor);
  });

  it('should retire all overlapping mutations and work previously aborted ordinarily', async () => {
    const runtime = createDataRuntime();
    const results = [
      deferred<number>(),
      deferred<number>(),
      deferred<number>(),
    ];
    const signals: AbortSignal[] = [];
    const rollback = vi.fn();
    const affects = vi.fn(() => ['same']);
    const mutation = createMutation({
      runtime,
      action: (input: number, { signal }) => {
        signals.push(signal);
        return results[input].promise;
      },
      optimistic: () => rollback,
      affects,
      afterSuccess: 'invalidate',
    });
    const first = mutation.execute(0).catch((error: unknown) => error);
    mutation.abort();
    const second = mutation.execute(1).catch((error: unknown) => error);
    const third = mutation.execute(2).catch((error: unknown) => error);
    disposeDataRuntime(runtime);
    expect(signals.every((signal) => signal.aborted)).toBe(true);
    expect(rollback).toHaveBeenCalledTimes(3);
    for (const error of await Promise.all([first, second, third]))
      expect(error).toMatchObject({ name: 'AbortError' });
    results.forEach((result, index) => result.resolve(index));
    await microtasks();
    expect(affects).not.toHaveBeenCalled();
    expect(mutation.result).toBeNull();
  });

  it('should not start an action when its optimistic callback retires the runtime', async () => {
    const runtime = createDataRuntime();
    const rollback = vi.fn();
    const action = vi.fn(async () => 'must not run');
    const mutation = createMutation({
      runtime,
      action,
      optimistic: () => {
        disposeDataRuntime(runtime);
        return rollback;
      },
    });
    await expect(mutation.execute(undefined)).rejects.toMatchObject({
      name: 'AbortError',
    });
    expect(action).not.toHaveBeenCalled();
    expect(rollback).toHaveBeenCalledTimes(1);
    expect(mutation.status).toBe('idle');
  });

  it.each(['success', 'failure'] as const)(
    'should retire an evicted retained query before an abort-ignoring %s',
    async (outcome) => {
      const runtime = createDataRuntime();
      const request = deferred<{ secret: string }>();
      let signal!: AbortSignal;
      const isConsistent = vi.fn(() => false);
      const reconcile = vi.fn(() => true);
      const fetch = vi.fn((context: { signal: AbortSignal }) => {
        signal = context.signal;
        return request.promise;
      });
      const query = createQuery({
        runtime,
        key: 'retained',
        gcTime: 0,
        initialData: { secret: 'old' },
        fetch,
        isConsistent,
        reconcile,
      });
      // A retained reader need not remain reachable through its public cache.
      runtime.queryCache.delete('retained');
      expect(runtime.queryCache.size).toBe(0);
      const pending = query.refresh();
      let settled = false;
      void pending.then(() => {
        settled = true;
      });
      flushSync();
      disposeDataRuntime(runtime);
      expect(signal.aborted).toBe(true);
      expect(query.data).toBeNull();
      expect(query.error).toMatchObject({ name: 'AbortError' });
      expect([
        query.loading,
        query.refreshing,
        query.stale,
        query.consistency,
        query.staleReason,
      ]).toEqual([false, false, true, 'stale', 'error']);
      await microtasks();
      expect(settled).toBe(true);
      if (outcome === 'success') request.resolve({ secret: 'late' });
      else request.reject(new Error('late failure'));
      await microtasks();
      expect(query.data).toBeNull();
      expect(isConsistent).not.toHaveBeenCalled();
      expect(reconcile).not.toHaveBeenCalled();
      expect(() => query.refresh()).toThrow(/disposed.*createDataRuntime/i);
      expect(fetch).toHaveBeenCalledTimes(1);
      disposeDataRuntime(runtime);
    }
  );

  it('should discard a pending reconciliation and queued retry', async () => {
    vi.useFakeTimers();
    const runtime = createDataRuntime();
    const reconciliation = deferred<boolean>();
    const fetch = vi.fn(async () => ({ value: 1 }));
    const reconcile = vi.fn(() => reconciliation.promise);
    const query = createQuery({
      runtime,
      key: 'reconcile',
      initialData: { value: 0 },
      fetch,
      isConsistent: () => false,
      reconcile,
    });
    const pending = query.refresh();
    flushSync();
    await microtasks();
    expect(reconcile).toHaveBeenCalledTimes(1);
    disposeDataRuntime(runtime);
    await pending;
    reconciliation.resolve(true);
    await microtasks();
    await vi.advanceTimersByTimeAsync(100);
    flushSync();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(query.data).toBeNull();
  });

  it.each(['success', 'failure'] as const)(
    'should promptly reject ownerless mutation callers and suppress late %s callbacks',
    async (outcome) => {
      const runtime = createDataRuntime();
      const actionResult = deferred<{ value: number }>();
      const rollback = vi.fn();
      const affects = vi.fn(() => ['other']);
      let signal!: AbortSignal;
      const mutation = createMutation({
        runtime,
        action: (_: number, context) => {
          signal = context.signal;
          return actionResult.promise;
        },
        optimistic: () => rollback,
        affects,
        afterSuccess: 'invalidate',
      });
      const failure = vi.fn();
      const success = vi.fn();
      void mutation.execute(1).then(success, failure);
      disposeDataRuntime(runtime);
      expect(signal.aborted).toBe(true);
      expect(rollback).toHaveBeenCalledTimes(1);
      expect([mutation.status, mutation.result, mutation.error]).toEqual([
        'idle',
        null,
        null,
      ]);
      await microtasks();
      expect(failure).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'AbortError' })
      );
      if (outcome === 'success') actionResult.resolve({ value: 99 });
      else actionResult.reject(new Error('late action failure'));
      await microtasks();
      expect(success).not.toHaveBeenCalled();
      expect(affects).not.toHaveBeenCalled();
      expect(rollback).toHaveBeenCalledTimes(1);
      disposeDataRuntime(runtime);
      mutation.abort();
      mutation.reset();
      await expect(mutation.execute(2)).rejects.toThrow(
        /disposed.*createDataRuntime/i
      );
      expect(mutation.status).toBe('idle');
    }
  );

  it('should drain other owners when rollback throws and reject reentrant work', async () => {
    const runtime = createDataRuntime();
    const rollbackError = new Error('rollback failed');
    const attempted = vi.fn();
    const rollback = vi.fn(() => {
      expect(() =>
        createQuery({ runtime, key: 'reentrant', fetch: attempted })
      ).toThrow(/disposed/i);
      throw rollbackError;
    });
    const mutation = createMutation({
      runtime,
      action: () => new Promise<{}>(() => {}),
      optimistic: () => rollback,
    });
    const rejected = mutation
      .execute(undefined)
      .catch((error: unknown) => error);
    let signal!: AbortSignal;
    const query = createQuery({
      runtime,
      key: 'drained',
      fetch: (context) => {
        signal = context.signal;
        return new Promise<{}>(() => {});
      },
    });
    flushSync();
    expect(() => disposeDataRuntime(runtime)).toThrow(
      'Optimistic mutation rollback failed'
    );
    expect(signal.aborted).toBe(true);
    expect(query.data).toBeNull();
    expect(runtime.queryCache.size).toBe(0);
    expect(attempted).not.toHaveBeenCalled();
    expect(() => disposeDataRuntime(runtime)).not.toThrow();
    expect(rollback).toHaveBeenCalledTimes(1);
    expect(await rejected).toMatchObject({ name: 'AbortError' });
  });

  it.each(['spa', 'ssr'] as const)(
    'should abort all %s prefetch joiners without restarting or publishing',
    async (mode) => {
      const runtime = createDataRuntime();
      const result = deferred<{ value: number }>();
      const signals: AbortSignal[] = [];
      const fetch = vi.fn((_: number, { signal }: { signal: AbortSignal }) => {
        signals.push(signal);
        return result.promise;
      });
      const definition = defineQuery({
        key: (id: number) => `joined:${id}`,
        fetch,
      });
      const registry = defineServerQueries(
        serveQuery(definition, ({ input, signal }) => fetch(input, { signal }))
      );
      const first = createQueryPrefetchContext({ runtime, mode, registry });
      const second = createQueryPrefetchContext({ runtime, mode, registry });
      const failures: unknown[] = [];
      void first
        .prefetch(definition, 1)
        .catch((error: unknown) => failures.push(error));
      void second
        .prefetch(definition, 1)
        .catch((error: unknown) => failures.push(error));
      expect(fetch).toHaveBeenCalledTimes(1);
      disposeDataRuntime(runtime);
      expect(signals[0].aborted).toBe(true);
      await microtasks();
      expect(failures).toHaveLength(2);
      expect(failures).toEqual([
        expect.objectContaining({ name: 'AbortError' }),
        expect.objectContaining({ name: 'AbortError' }),
      ]);
      result.resolve({ value: 99 });
      await microtasks();
      expect(runtime.queryData.size).toBe(0);
      expect(fetch).toHaveBeenCalledTimes(1);
      await expect(first.prefetch(definition, 2)).rejects.toThrow(/disposed/i);
      expect(() => createQueryPrefetchContext({ runtime })).toThrow(
        /disposed/i
      );
    }
  );

  it('should reject new work and hydration, erase dehydration, and leave another runtime usable', async () => {
    const retired = createDataRuntime();
    const live = createDataRuntime();
    hydrateDataRuntime(retired, { private: { secret: 'old' } });
    const oldMutation = createMutation({
      runtime: retired,
      action: async () => ({ secret: 'old' }),
    });
    await oldMutation.execute(undefined);
    disposeDataRuntime(retired);
    expect(oldMutation.result).toBeNull();
    expect(retired.queryData.size).toBe(0);
    expect(() =>
      createQuery({ runtime: retired, key: 'new', fetch: async () => ({}) })
    ).toThrow(/disposed/i);
    expect(() =>
      createMutation({ runtime: retired, action: async () => ({}) })
    ).toThrow(/disposed/i);
    expect(() => hydrateDataRuntime(retired, { private: 'revived' })).toThrow(
      /disposed/i
    );
    expect(() => invalidate('', { runtime: retired })).toThrow(/disposed/i);
    retired.queryData.set('caller-write', 'outside the contract');
    expect(dehydrateDataRuntime(retired)).toEqual({});
    const query = createQuery({
      runtime: live,
      key: 'new',
      fetch: async () => ({ live: true }),
    });
    flushSync();
    await query.refresh();
    expect(query.data).toEqual({ live: true });
    disposeDataRuntime(live);
  });

  it('should reject foreign containers and the shared default without retiring it', async () => {
    expect(() =>
      disposeDataRuntime({ queryCache: new Map(), queryData: new Map() })
    ).toThrow(/not created by createDataRuntime/);
    const runtime = getDefaultDataRuntime();
    expect(() => disposeDataRuntime(runtime)).toThrow(/default.*isolated/i);
    const mutation = createMutation({
      runtime,
      action: async () => 'still live',
    });
    expect(await mutation.execute(undefined)).toBe('still live');
  });
});
