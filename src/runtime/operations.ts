import {
  getCurrentComponentInstance,
  registerMountOperation,
  type ComponentInstance,
} from './component';
import { getCurrentContextFrame } from './context';
import { ResourceCell } from './resource-cell';
import { state } from './state';
import { globalScheduler } from './scheduler';
import { getSSRBridge } from './ssr-bridge';
import { SSRDataMissingError } from '../common/ssr-errors';

// Memoization cache for derive() (centralized)

export interface ResourceResult<T> {
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
): ResourceResult<T> {
  const instance = getCurrentComponentInstance();
  // Create a non-null alias early so it can be used in nested closures
  // without TypeScript complaining about possible null access.
  const inst = instance as ComponentInstance;

  if (!instance) {
    const ssr = getSSRBridge();
    // If we're in a synchronous SSR render that has resolved data, use it.
    const renderData = ssr.getCurrentRenderData();
    if (renderData) {
      const key = ssr.getNextKey();
      if (!(key in renderData)) {
        ssr.throwSSRDataMissing();
      }
      const val = renderData[key] as T;
      return {
        value: val,
        pending: false,
        error: null,
        refresh: () => {},
      } as ResourceResult<T>;
    }

    // If we are in an SSR render pass without supplied data, throw for clarity.
    const ssrCtx = ssr.getCurrentSSRContext();
    if (ssrCtx) {
      ssr.throwSSRDataMissing();
    }

    // No active component instance and not in SSR render with data.
    // Autopilot invariant: resources must be created during render within an app.
    throw new Error(
      '[Askr] resource() must be called during component render inside an app. ' +
        'Do not create resources at module scope or outside render.'
    );
  }

  // Internal ResourceCell — pure state machine now moved to its own module
  // to keep component wiring separate and ensure no component access here.
  // (See ./resource-cell.ts)

  // If we're in a synchronous SSR render that was supplied resolved data, use it
  const ssr = getSSRBridge();
  const renderData = ssr.getCurrentRenderData();
  if (renderData) {
    // Deterministic key generation: the collection step and render step use
    // the same incremental key generation to align resources.
    const key = ssr.getNextKey();
    if (!(key in renderData)) {
      ssr.throwSSRDataMissing();
    }

    // Commit synchronous value from render data and return a stable snapshot
    const val = renderData[key] as T;

    const holder = state<{
      cell?: ResourceCell<T>;
      snapshot: ResourceResult<T>;
    }>({
      cell: undefined,
      snapshot: {
        value: val,
        pending: false,
        error: null,
        refresh: () => {},
      },
    });

    const h = holder();
    h.snapshot.value = val;
    h.snapshot.pending = false;
    h.snapshot.error = null;
    holder.set(h);
    return h.snapshot;
  }

  // Persist a holder so the snapshot identity is stable across renders.
  const holder = state<{ cell?: ResourceCell<T>; snapshot: ResourceResult<T> }>(
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
    // Attach debug label (component name) for richer logs
    cell.ownerName = inst.fn?.name || '<anonymous>';
    h.cell = cell;
    h.snapshot = cell.snapshot as ResourceResult<T>;

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

    // Render invariant: do NOT start async work during render on the client.
    // SSR remains strict/synchronous and must throw immediately if async is encountered.
    if (inst.ssr) {
      // SSR: must run synchronously so missing data throws during render
      cell.start(true, false);
      if (!cell.pending) {
        const cur = holder();
        cur.snapshot.value = cell.value;
        cur.snapshot.pending = cell.pending;
        cur.snapshot.error = cell.error;
      }
    } else {
      // Client: start after render via scheduler (never inline)
      globalScheduler.enqueue(() => {
        try {
          cell.start(false, false);
        } catch (err) {
          // Non-SSR: reflect synchronous errors into snapshot via manual update
          const cur = holder();
          cur.snapshot.value = cell.value;
          cur.snapshot.pending = cell.pending;
          cur.snapshot.error = (err as Error) ?? null;
          holder.set(cur);
          inst._enqueueRun?.();
          return;
        }

        // If the resource completed synchronously, subscribers were not notified.
        // Force a re-render so the component can observe the value.
        if (!cell.pending) {
          const cur = holder();
          cur.snapshot.value = cell.value;
          cur.snapshot.pending = cell.pending;
          cur.snapshot.error = cell.error;
          holder.set(cur);
          inst._enqueueRun?.();
        }
      });
    }
  }

  const cell = h.cell!;

  // Detect dependency changes and refresh immediately
  const depsChanged =
    !cell.deps ||
    cell.deps.length !== deps.length ||
    cell.deps.some((d, i) => d !== deps[i]);

  if (depsChanged) {
    cell.deps = deps.slice();
    cell.generation++;
    cell.pending = true;
    cell.error = null;
    try {
      if (inst.ssr) {
        cell.start(true, false);
        if (!cell.pending) {
          const cur = holder();
          cur.snapshot.value = cell.value;
          cur.snapshot.pending = cell.pending;
          cur.snapshot.error = cell.error;
        }
      } else {
        globalScheduler.enqueue(() => {
          cell.start(false, false);
          if (!cell.pending) {
            const cur = holder();
            cur.snapshot.value = cell.value;
            cur.snapshot.pending = cell.pending;
            cur.snapshot.error = cell.error;
            holder.set(cur);
            inst._enqueueRun?.();
          }
        });
      }
    } catch (err) {
      if (err instanceof SSRDataMissingError) throw err;
      cell.error = err as Error;
      cell.pending = false;
      const cur = holder();
      cur.snapshot.value = cell.value;
      cur.snapshot.pending = cell.pending;
      cur.snapshot.error = cell.error;
      // Do not call holder.set() here; this is still render.
    }
  }

  // Return the stable snapshot object owned by the cell
  return h.snapshot;
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
