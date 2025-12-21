import {
  getCurrentComponentInstance,
  registerMountOperation,
  type ComponentInstance,
} from './component';
import { getCurrentContextFrame } from './context';
import { ResourceCell } from './resource_cell';
import { state } from './state';
import { getDeriveCache } from '../shared/derive_cache';
import { getCurrentSSRContext, SSRDataMissingError } from '../ssr/context';
import {
  isCollecting,
  registerResourceIntent,
  getCurrentRenderData,
  getNextKey,
} from '../ssr/data';

// Memoization cache for derive() (centralized)

export interface DataResult<T> {
  value: T | null;
  pending: boolean;
  error: Error | null;
  refresh(): void;
}

/**
 * Resource primitive — simple, deterministic async primitive
 * Usage: resource(fn, deps)
 * - fn receives { signal }
 * - captures execution context once at creation (synchronous step only)
 * - executes at most once per generation; stale async results are ignored
 * - refresh() cancels in-flight execution, increments generation and re-runs
 * - exposes { value, pending, error, refresh }
 * - during SSR, async results are disallowed and will throw synchronously
 */
export function resource<T>(
  fn: (opts: { signal: AbortSignal }) => Promise<T> | T,
  deps: unknown[] = []
): DataResult<T> {
  const instance = getCurrentComponentInstance();
  // Create a non-null alias early so it can be used in nested closures
  // without TypeScript complaining about possible null access.
  const inst = instance as ComponentInstance;

  if (!instance) {
    // Allow calling resource() during collection prepass even outside a
    // component render; register a declarative intent instead of executing.
    if (isCollecting()) {
      registerResourceIntent(fn as (opts: { signal?: AbortSignal }) => Promise<unknown> | unknown, deps);
      return {
        value: null,
        pending: true,
        error: null,
        refresh: () => {},
      } as DataResult<T>;
    }

    // If we're in a synchronous SSR render that has resolved data, use it.
    const renderData = getCurrentRenderData();
    if (renderData) {
      const key = getNextKey();
      if (!(key in renderData)) {
        throw new SSRDataMissingError();
      }
      const val = renderData[key] as T;
      return {
        value: val,
        pending: false,
        error: null,
        refresh: () => {},
      } as DataResult<T>;
    }

    // If we are in an SSR render pass without supplied data, throw for clarity.
    const ssrCtx = getCurrentSSRContext();
    if (ssrCtx) {
      throw new SSRDataMissingError();
    }

    // No active component instance and not in collection or SSR render with data.
    // This can happen when a route handler calls `resource()` outside a component
    // render during a non-collection server render — treat as benign and return
    // a pending snapshot rather than throwing to allow final render to proceed.
    return {
      value: null,
      pending: true,
      error: null,
      refresh: () => {},
    } as DataResult<T>;
  }



  // Internal ResourceCell — pure state machine now moved to its own module
  // to keep component wiring separate and ensure no component access here.
  // (See ./resource_cell.ts)
  
  // If a collection prepass is active, register intent and return a placeholder
  if (isCollecting()) {
    // Register the intent with a stable key and don't execute the function.
    registerResourceIntent(fn as (opts: { signal?: AbortSignal }) => Promise<unknown> | unknown, deps);
    // Provide a snapshot-like object (pending) so consuming code during collection
    // can safely call value/pending/error but no real data is present.
    return {
      value: null,
      pending: true,
      error: null,
      refresh: () => {},
    } as DataResult<T>;
  }

  // If we're in a synchronous SSR render that was supplied resolved data, use it
  const renderData = getCurrentRenderData();
  if (renderData) {
    // Deterministic key generation: the collection step and render step use
    // the same incremental key generation to align resources.
    const key = getNextKey();
    if (!(key in renderData)) {
      throw new SSRDataMissingError();
    }

    // Commit synchronous value from render data and return a stable snapshot
    const val = renderData[key] as T;

    const holder = state<{ cell?: ResourceCell<T>; snapshot: DataResult<T> }>(
      {
        cell: undefined,
        snapshot: {
          value: val,
          pending: false,
          error: null,
          refresh: () => {},
        },
      }
    );

    const h = holder();
    h.snapshot.value = val;
    h.snapshot.pending = false;
    h.snapshot.error = null;
    holder.set(h);
    return h.snapshot;
  }

  // Persist a holder so the snapshot identity is stable across renders.
  const holder = state<{ cell?: ResourceCell<T>; snapshot: DataResult<T> }>(
    {
      cell: undefined,
      snapshot: {
        value: null,
        pending: true,
        error: null,
        refresh: () => {},
      },
    }
  );

  const h = holder();

  // Initialize cell on first call
  if (!h.cell) {
    const frame = getCurrentContextFrame();
    const cell = new ResourceCell<T>(fn, deps, frame);
    h.cell = cell;
    h.snapshot = cell.snapshot as DataResult<T>;

    // Subscribe and schedule component updates when cell changes
    const unsubscribe = cell.subscribe(() => {
      const cur = holder();
      cur.snapshot.value = cell.snapshot.value;
      cur.snapshot.pending = cell.snapshot.pending;
      cur.snapshot.error = cell.snapshot.error;
      holder.set(cur);
      try {
        inst._enqueueRun?.();
      } catch {
        // ignore
      }
    });

    // Cleanup on unmount
    inst.cleanupFns.push(() => {
      unsubscribe();
      cell.abort();
    });

    // Start immediately (not tied to mount timing); SSR will throw if async
    try {
      // Avoid notifying subscribers synchronously during render — update
      // holder.snapshot in-place instead to prevent state.set() during render.
      cell.start(inst.ssr ?? false, false);
      // If the run completed synchronously, reflect the result into the holder
      if (!cell.pending) {
        const cur = holder();
        cur.snapshot.value = cell.value;
        cur.snapshot.pending = cell.pending;
        cur.snapshot.error = cell.error;
        // Do not call holder.set() here — we are still in render; the host
        // component will read the snapshot immediately.
      }
    } catch (err) {
      if (err instanceof SSRDataMissingError) throw err;
      // Synchronous error — reflect into snapshot
      cell.error = err as Error;
      cell.pending = false;
      const cur = holder();
      cur.snapshot.value = cell.value;
      cur.snapshot.pending = cell.pending;
      cur.snapshot.error = cell.error;
      // Do not call holder.set() here for the same reason as above
    }
  }

  const cell = h.cell!;

  // Detect dependency changes and refresh immediately
  const depsChanged =
    !cell.deps || cell.deps.length !== deps.length || cell.deps.some((d, i) => d !== deps[i]);

  if (depsChanged) {
    cell.deps = deps.slice();
    cell.generation++;
    cell.pending = true;
    cell.error = null;
    try {
      cell.start(inst.ssr ?? false, false);
      if (!cell.pending) {
        const cur = holder();
        cur.snapshot.value = cell.value;
        cur.snapshot.pending = cell.pending;
        cur.snapshot.error = cell.error;
      }
    } catch (err) {
      if (err instanceof SSRDataMissingError) throw err;
      cell.error = err as Error;
      cell.pending = false;
      const cur = holder();
      cur.snapshot.value = cell.value;
      cur.snapshot.pending = cell.pending;
      cur.snapshot.error = cell.error;
    }
  }

  // Return the stable snapshot object owned by the cell
  return h.snapshot;
}

export function derive<TIn, TOut>(
  source:
    | { value: TIn | null; pending?: boolean; error?: Error | null }
    | TIn
    | (() => TIn),
  map: (value: TIn) => TOut
): TOut | null {
  // Extract the actual value
  let value: TIn;
  if (typeof source === 'function' && !('value' in source)) {
    // It's a function (not a binding object with value property)
    value = (source as () => TIn)();
  } else {
    value = (source as { value?: TIn | null })?.value ?? (source as TIn);
  }
  if (value == null) return null;

  // Get or create memoization cache for this component
  const instance = getCurrentComponentInstance();
  if (!instance) {
    // No component context - just compute eagerly
    return map(value as TIn);
  }

  // Get or create the cache map for this component
  const cache = getDeriveCache(instance);

  // Check if we already have a cached result for this source value
  if (cache.has(value)) {
    return cache.get(value) as TOut;
  }

  // Compute and cache the result
  const result = map(value as TIn);
  cache.set(value, result);
  return result;
}

export function on(
  target: EventTarget,
  event: string,
  handler: EventListener
): void {
  const ownerIsRoot = getCurrentComponentInstance()?.isRoot ?? false;
  // Register the listener to be attached on mount. If the owner is not the
  // root app instance, fail loudly to prevent silent no-op behavior.
  registerMountOperation(() => {
    if (!ownerIsRoot) {
      throw new Error('[Askr] on() may only be used in root components');
    }
    target.addEventListener(event, handler);
    // Return cleanup function
    return () => {
      target.removeEventListener(event, handler);
    };
  });
}

export function timer(intervalMs: number, fn: () => void): void {
  const ownerIsRoot = getCurrentComponentInstance()?.isRoot ?? false;
  // Register the timer to be started on mount. Fail loudly when used outside
  // of the root component to avoid silent no-ops.
  registerMountOperation(() => {
    if (!ownerIsRoot) {
      throw new Error('[Askr] timer() may only be used in root components');
    }
    const id = setInterval(fn, intervalMs);
    // Return cleanup function
    return () => {
      clearInterval(id);
    };
  });
}

export function stream<T>(
  _source: unknown,
  _options?: Record<string, unknown>
): { value: T | null; pending: boolean; error: Error | null } {
  // Stub implementation: no-op.
  return { value: null, pending: true, error: null };
}

export function task(
  fn: () => void | (() => void) | Promise<void | (() => void)>
): void {
  const ownerIsRoot = getCurrentComponentInstance()?.isRoot ?? false;
  // Register the task to run on mount. Fail loudly when used outside the root
  // component so callers get immediate feedback rather than silent no-op.
  registerMountOperation(async () => {
    if (!ownerIsRoot) {
      throw new Error('[Askr] task() may only be used in root components');
    }
    // Execute the task (may be async) and return its cleanup
    return await fn();
  });
}

/**
 * Capture the result of a synchronous expression at call time and return a
 * thunk that returns the captured value later. This is a low-level helper for
 * cases where async continuations need to observe a snapshot of values at the
 * moment scheduling occurred.
 *
 * Usage (public API):
 * const snapshot = capture(() => someState());
 * Promise.resolve().then(() => { use(snapshot()); });
 */
export function capture<T>(fn: () => T): () => T {
  const value = fn();
  return () => value;
}
