import { describe, it, expect, vi } from 'vitest';
import { ResourceCell } from '../../../src/runtime/resource-cell';

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('1. rapid re-invocation ordering', () => {
  it('last-fired resolves first: only latest invocation commits', async () => {
    const d1 = deferred<string>();
    const d2 = deferred<string>();
    const d3 = deferred<string>();
    const calls: Array<{ signal: AbortSignal }> = [];
    const promises = [d1.promise, d2.promise, d3.promise];
    let i = 0;
    const cell = new ResourceCell<string>(
      ({ signal }) => {
        calls.push({ signal });
        return promises[i++];
      },
      null,
      null
    );

    cell.start(false, false); // gen0 -> d1
    cell.refresh(); // gen1 -> d2
    cell.refresh(); // gen2 -> d3

    // resolve out of order: last-fired (d3) resolves first
    d3.resolve('third');
    await Promise.resolve();
    await Promise.resolve();
    expect(cell.value).toBe('third');
    expect(cell.pending).toBe(false);

    // now first-fired (d1) resolves LAST -- should be discarded
    d1.resolve('first');
    await Promise.resolve();
    await Promise.resolve();
    expect(cell.value).toBe('third'); // must NOT have been overwritten by stale d1

    d2.resolve('second');
    await Promise.resolve();
    await Promise.resolve();
    expect(cell.value).toBe('third'); // still must not be overwritten by stale d2
  });

  it('first-fired resolves last (natural order): only latest commits', async () => {
    const d1 = deferred<string>();
    const d2 = deferred<string>();
    const promises = [d1.promise, d2.promise];
    let i = 0;
    const cell = new ResourceCell<string>(() => promises[i++], null, null);

    cell.start(false, false);
    cell.refresh();

    d1.resolve('stale');
    await Promise.resolve();
    await Promise.resolve();
    expect(cell.value).toBe(null); // stale must not commit

    d2.resolve('fresh');
    await Promise.resolve();
    await Promise.resolve();
    expect(cell.value).toBe('fresh');
  });

  it('resolves in totally scrambled order across 5 generations', async () => {
    const ds = Array.from({ length: 5 }, () => deferred<number>());
    let i = 0;
    const cell = new ResourceCell<number>(() => ds[i++].promise, null, null);

    cell.start(false, false); // gen0
    for (let g = 1; g < 5; g++) cell.refresh(); // gen1..4

    // resolve in scrambled order: 2, 0, 4, 1, 3
    const order = [2, 0, 4, 1, 3];
    for (const idx of order) {
      ds[idx].resolve(idx);
      await Promise.resolve();
      await Promise.resolve();
    }
    // only gen4 (index 4) result should ever be visible
    expect(cell.value).toBe(4);
  });
});

describe('2. user code swallows AbortError internally', () => {
  it('discards a resolved value even though async fn caught AbortError and returned normally', async () => {
    const d1 = deferred<string>();
    const d2 = deferred<string>();
    let firstSignal: AbortSignal | null = null;

    const cell = new ResourceCell<string>(
      ({ signal }) => {
        if (!firstSignal) {
          firstSignal = signal;
          // Simulate: user's fn internally catches AbortError from a fetch,
          // and resolves with a normal fallback value anyway.
          return d1.promise.catch(() => 'fallback-after-swallowed-abort');
        }
        return d2.promise;
      },
      null,
      null
    );

    cell.start(false, false); // gen0, signal S0
    cell.refresh(); // gen1 aborts S0, starts gen1 with S1

    expect(firstSignal!.aborted).toBe(true);

    // gen0's promise resolves normally (not rejects) despite signal aborted,
    // because user code swallowed the AbortError.
    d1.resolve('should-never-commit');
    // wait for the internal .catch() chain within the fn AND the cell's .then()
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    // Must NOT have committed the stale (fallback) value.
    expect(cell.value).not.toBe('fallback-after-swallowed-abort');
    expect(cell.value).toBe(null);
    expect(cell.pending).toBe(true); // still waiting on gen1

    d2.resolve('gen1-real-value');
    await Promise.resolve();
    await Promise.resolve();
    expect(cell.value).toBe('gen1-real-value');
  });
});

describe('3. abort during synchronous portion (before first await)', () => {
  it('refresh() called synchronously before fn reaches its first await', () => {
    const controllers: AbortController[] = [];
    const cell = new ResourceCell<string>(
      ({ signal }) => {
        // capture controller-equivalent via signal; record aborted state
        controllers.push((cell as any).controller);
        return new Promise<string>(() => {
          /* never resolves synchronously */
        });
      },
      null,
      null
    );

    cell.start(false, false);
    const firstController = cell.controller;
    // Immediately refresh before any microtask runs
    cell.refresh();
    const secondController = cell.controller;

    expect(firstController).not.toBe(secondController);
    expect(firstController!.signal.aborted).toBe(true);
    expect(secondController!.signal.aborted).toBe(false);
    expect(cell.generation).toBe(1);
  });

  it('refresh() fired multiple times synchronously in the same tick', () => {
    let calls = 0;
    const cell = new ResourceCell<string>(
      () => {
        calls++;
        return new Promise<string>(() => {});
      },
      null,
      null
    );

    cell.start(false, false);
    cell.refresh();
    cell.refresh();
    cell.refresh();
    cell.refresh();

    expect(calls).toBe(5); // initial start + 4 refreshes, all synchronous
    expect(cell.generation).toBe(4);
    expect(cell.pending).toBe(true);
    expect(cell.error).toBe(null);
  });
});

describe('4. errors racing with cancellation', () => {
  it('stale rejection after supersession does not flip error for new in-flight request', async () => {
    const d1 = deferred<string>();
    const d2 = deferred<string>();
    const promises = [d1.promise, d2.promise];
    let i = 0;
    const cell = new ResourceCell<string>(() => promises[i++], null, null);

    cell.start(false, false); // gen0
    cell.refresh(); // gen1, gen0 superseded

    // old request rejects with a REAL (non-abort) error, after being superseded
    d1.reject(new Error('boom-stale'));
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(cell.error).toBe(null); // must not leak into current state
    expect(cell.pending).toBe(true); // gen1 still in flight

    d2.resolve('fresh-value');
    await Promise.resolve();
    await Promise.resolve();
    expect(cell.value).toBe('fresh-value');
    expect(cell.error).toBe(null);
  });

  it('stale rejection arrives AFTER new request already resolved', async () => {
    const d1 = deferred<string>();
    const d2 = deferred<string>();
    const promises = [d1.promise, d2.promise];
    let i = 0;
    const cell = new ResourceCell<string>(() => promises[i++], null, null);

    cell.start(false, false);
    cell.refresh();

    d2.resolve('fresh');
    await Promise.resolve();
    await Promise.resolve();
    expect(cell.value).toBe('fresh');
    expect(cell.pending).toBe(false);

    // now the stale, superseded promise rejects with a real error
    d1.reject(new Error('late-stale-error'));
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    // must not clobber the already-settled fresh state
    expect(cell.value).toBe('fresh');
    expect(cell.error).toBe(null);
    expect(cell.pending).toBe(false);
  });
});

describe('5. high-frequency churn', () => {
  it('50 rapid re-invocations: all intermediate controllers aborted, only last commits', async () => {
    const N = 50;
    const deferreds = Array.from({ length: N }, () => deferred<number>());
    let i = 0;
    const seenControllers: AbortController[] = [];
    const cell = new ResourceCell<number>(
      () => {
        seenControllers.push(cell.controller!);
        return deferreds[i++].promise;
      },
      null,
      null
    );

    cell.start(false, false);
    for (let g = 1; g < N; g++) {
      cell.refresh();
    }

    expect(cell.generation).toBe(N - 1);
    expect(seenControllers.length).toBe(N);

    // Every controller except the last must be aborted (no leaks / abandoned controllers).
    for (let idx = 0; idx < N - 1; idx++) {
      expect(seenControllers[idx].signal.aborted).toBe(true);
    }
    expect(seenControllers[N - 1].signal.aborted).toBe(false);

    // Resolve all in reverse order (most stale resolves last among the stale ones,
    // but the fresh one resolves first) to maximize adversarial pressure.
    deferreds[N - 1].resolve(N - 1); // resolve the CURRENT one first
    await Promise.resolve();
    await Promise.resolve();
    expect(cell.value).toBe(N - 1);

    for (let idx = N - 2; idx >= 0; idx--) {
      deferreds[idx].resolve(idx); // resolve every stale one afterward
    }
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    // Final state must still reflect only the last invocation.
    expect(cell.value).toBe(N - 1);
    expect(cell.pending).toBe(false);
    expect(cell.error).toBe(null);
  });

  it('100 rapid re-invocations with mixed resolve/reject noise from stale generations', async () => {
    const N = 100;
    const deferreds = Array.from({ length: N }, () => deferred<number>());
    let i = 0;
    const cell = new ResourceCell<number>(
      () => deferreds[i++].promise,
      null,
      null
    );

    cell.start(false, false);
    for (let g = 1; g < N; g++) cell.refresh();

    // Settle stale ones with a mix of resolve/reject, scrambled, BEFORE the final one.
    for (let idx = 0; idx < N - 1; idx++) {
      if (idx % 2 === 0) deferreds[idx].resolve(-1);
      else deferreds[idx].reject(new Error('stale-' + idx));
    }
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(cell.value).toBe(null);
    expect(cell.error).toBe(null);
    expect(cell.pending).toBe(true);

    deferreds[N - 1].resolve(N - 1);
    await Promise.resolve();
    await Promise.resolve();

    expect(cell.value).toBe(N - 1);
    expect(cell.error).toBe(null);
    expect(cell.pending).toBe(false);
  });
});
