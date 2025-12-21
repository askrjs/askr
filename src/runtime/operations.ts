import {
  getCurrentComponentInstance,
  registerMountOperation,
} from './component';
import { logger } from '../dev/logger';
import {
  getCurrentContextFrame,
  withAsyncResourceContext,
  type ContextFrame,
} from './context';
import { state } from './state';
import { getDeriveCache } from '../shared/derive_cache';
import { globalScheduler } from './scheduler';

// Memoization cache for derive() (centralized)

export interface DataResult<T> {
  value: T | null;
  pending: boolean;
  error: Error | null;
  refresh(): void;
}

/**
 * Resource primitive — single unified async construct
 * Usage: resource(fn, deps)
 * - fn receives { signal }
 * - starts on mount
 * - re-executes when deps change
 * - aborts on unmount or invalidation
 * - exposes { value, pending, error, refresh }
 */
export function resource<T>(
  fn: (opts: { signal: AbortSignal }) => Promise<T> | T,
  deps: unknown[] = []
): DataResult<T> {
  const instance = getCurrentComponentInstance()!;
  if (!instance) {
    throw new Error('resource() can only be called during component render.');
  }
  try {
    logger.debug(
      '[Askr] resource() called in instance',
      instance.id,
      'ssr?',
      !!instance.ssr
    );
  } catch {
    // ignore logging errors
  }

  // Internal persistent container for this resource
  type Internal = {
    value: T | null;
    pending: boolean;
    error: Error | null;
    refresh: () => void;
    _generation: number;
    _controller: AbortController | null;
    _deps: unknown[] | null;
    _started: boolean;
    _resourceFrame: ContextFrame | null; // Captured once at creation, never rewritten
    // Reused snapshot object returned from `resource()` to avoid allocating a new
    // object on every render call. We update its fields in-place when state changes.
    _snapshot: {
      value: T | null;
      pending: boolean;
      error: Error | null;
      refresh: () => void;
    };
  };

  const internalState = state<Internal>({
    value: null,
    pending: true,
    error: null,
    refresh: () => {
      const s = internalState();
      s._generation++;
      // abort previous
      s._controller?.abort();
      s.pending = true;
      s.error = null;
      // Keep snapshot in sync
      s._snapshot.pending = true;
      s._snapshot.error = null;
      // Start immediately if mounted, otherwise register for mount
      if (instance.mounted) {
        startExecution();
      } else {
        registerMountOperation(() => {
          startExecution();
        });
      }
      internalState.set(s);
    },
    _generation: 0,
    _controller: null,
    _deps: null,
    _started: false,
    _resourceFrame: getCurrentContextFrame(), // Capture once, never rewritten
    _snapshot: {
      value: null,
      pending: true,
      error: null,
      refresh: () => internalState().refresh(),
    },
  });

  function startExecution() {
    const s = internalState();
    const generation = s._generation;

    // Abort any previous controller
    s._controller?.abort();
    const controller = new AbortController();
    s._controller = controller;
    s._started = true;
    s.pending = true;
    internalState.set(s);

    // Defer the actual invocation for non-root instances to allow sibling
    // re-renders to update captured snapshots first. This avoids a race where
    // startExecution runs before the most recent render updated
    // internalState()._resourceFrame.
    const doStart = () => {
      // SNAPSHOT SEMANTIC:
      // Capture the resource's frozen context frame. This frame is set once
      // at resource creation time and never changes, ensuring deterministic
      // behavior regardless of scheduling or interleaving.
      const resourceFrame = s._resourceFrame;

      let result: Promise<T> | T;

      try {
        // SSR: disallow async execution
        if (instance.ssr) {
          result = withAsyncResourceContext(resourceFrame, () =>
            fn({ signal: controller.signal })
          );
          if (result instanceof Promise) {
            throw new Error('SSR does not allow async resource execution');
          }
          // Synchronous result — commit immediately
          s.value = result as T;
          s.pending = false;
          s.error = null;
          // Keep snapshot in sync and return it (avoid allocating)
          s._snapshot.value = s.value;
          s._snapshot.pending = s.pending;
          s._snapshot.error = s.error;
          internalState.set(s);
          return;
        }

        // Execute the resource function within the captured frame.
        // INVARIANT: The frame is set for the initial synchronous execution step,
        // then cleared. Each continuation after an await will NOT have the frame
        // set globally, but can still call readContext() because JavaScript closures
        // capture the necessary scope, and we wrap promise handlers below.
        result = withAsyncResourceContext(resourceFrame, () =>
          fn({ signal: controller.signal })
        );
      } catch (err) {
        s.pending = false;
        s.error = err as Error;
        s._snapshot.pending = s.pending;
        s._snapshot.error = s.error;
        internalState.set(s);
        try {
          logger.error('[Askr] Async resource error:', err);
        } catch {
          // ignore logging errors
        }
        return;
      }

      if (!(result instanceof Promise)) {
        // Synchronous result — commit immediately
        s.value = result as T;
        s.pending = false;
        s.error = null;
        // Keep snapshot in sync
        s._snapshot.value = s.value;
        s._snapshot.pending = s.pending;
        s._snapshot.error = s.error;
        internalState.set(s);
        return;
      }

      // Async result — wrap handlers to restore context for each continuation step
      // CRITICAL: We don't keep the frame active across await. Instead, we wrap
      // each then/catch handler so they execute within the resource's frame.
      const promise = result as Promise<T>;
      promise
        .then((val) =>
          // Wrap the resolution handler to restore context
          withAsyncResourceContext(resourceFrame, () => {
            const curr = internalState();
            // drop stale completions
            if (curr._generation !== generation) {
              return;
            }
            if (curr._controller === controller) {
              curr.value = val;
              curr.pending = false;
              curr.error = null;
              // Keep snapshot in sync
              curr._snapshot.value = curr.value;
              curr._snapshot.pending = curr.pending;
              curr._snapshot.error = curr.error;
              internalState.set(curr);
              try {
                logger.debug(
                  '[Askr] resource resolved for',
                  instance.id,
                  'value:',
                  val
                );
              } catch {
                // ignore logging errors
              }
              // Schedule a re-render for the owning component so it can observe new value
              try {
                logger.debug(
                  '[Askr] resource enqueue notifyUpdate for',
                  instance.id
                );
              } catch {
                // ignore logging errors
              }
              // Enqueue the prebound helper to avoid allocating a closure per resolution
              globalScheduler.enqueue(instance._enqueueRun!);
            }
          })
        )
        .catch((err) =>
          // Wrap the error handler to restore context
          withAsyncResourceContext(resourceFrame, () => {
            const curr = internalState();
            if (curr._generation !== generation) {
              return;
            }
            curr.pending = false;
            curr.error = err as Error;
            // Keep snapshot in sync
            curr._snapshot.pending = curr.pending;
            curr._snapshot.error = curr.error;
            internalState.set(curr);
            // Log error so it's visible and can be asserted in tests
            try {
              logger.error('[Askr] Async resource error:', err);
            } catch (e) {
              void e;
            }
            globalScheduler.enqueue(instance._enqueueRun!);
          })
        );
    };

    // For non-root instances defer the actual execution one tick so sibling
    // renders can update captured snapshots
    if (!instance.isRoot) {
      // IMPORTANT: use a microtask boundary so state updates performed
      // immediately after mount (in the same call stack) can settle before the
      // resource function runs its initial synchronous reads.
      const scheduleMicrotask =
        typeof queueMicrotask === 'function'
          ? queueMicrotask
          : (cb: () => void) => Promise.resolve().then(cb);

      const doStartIfCurrent = () => {
        const cur = internalState();
        if (cur._generation !== s._generation) return;
        doStart();
      };

      scheduleMicrotask(() => {
        globalScheduler.enqueue(doStartIfCurrent);
      });
      return;
    }

    doStart();
  }

  // Initialize or refresh if deps changed
  const s = internalState();
  const depsChanged =
    !s._deps ||
    s._deps.length !== deps.length ||
    s._deps.some((d, i) => d !== deps[i]);

  try {
    logger.debug(
      '[Askr] resource deps check:',
      instance.id,
      'prevDeps:',
      s._deps,
      'newDeps:',
      deps,
      'changed:',
      depsChanged
    );
  } catch {
    // ignore logging errors
  }

  if (depsChanged) {
    // Mutate internal object in-place to avoid calling state.set() during render.
    // State mutations that need to be observed are scheduled later through the
    // scheduler when async work completes.
    s._deps = deps.slice();
    s._generation++;
    // Mark pending for consumers (in-place mutation is safe for object identity)
    s.pending = true;
    s.error = null;

    // SSR: execute synchronously and disallow async resource fn
    if (instance.ssr) {
      try {
        const result = fn({ signal: new AbortController().signal });
        if (result instanceof Promise) {
          throw new Error('SSR does not allow async resource execution');
        }
        s.value = result as T;
        s.pending = false;
        s.error = null;
        // Keep snapshot in sync
        s._snapshot.value = s.value;
        s._snapshot.pending = s.pending;
        s._snapshot.error = s.error;
        internalState.set(s);
      } catch (err) {
        s.pending = false;
        s.error = err as Error;
        s._snapshot.pending = s.pending;
        s._snapshot.error = s.error;
        internalState.set(s);
      }

      // Return snapshot in SSR mode
      return s._snapshot;
    } else {
      // Schedule startExecution to run when component mounts and ensure cleanup
      if (instance.isRoot) {
        registerMountOperation(() => {
          // Defer starting execution to the scheduler so sibling re-renders that
          // occur immediately after mount can update captured snapshots first.
          globalScheduler.enqueue(() => {
            startExecution();
          });
          return () => {
            const cur = internalState();
            cur._controller?.abort();
          };
        });
      } else {
        // For non-root instances, execute startExecution on the next tick so
        // resources start for child components even though child mount
        // operations are not executed (ownership contract). Register an
        // explicit cleanup on the instance so unmount aborts the controller.
        globalScheduler.enqueue(() => {
          startExecution();
        });
        // Register cleanup directly on instance.cleanupFns so cleanupComponent
        // will abort controllers on unmount even if mount ops were not executed.
        const cur = internalState();
        instance.cleanupFns.push(() => {
          cur._controller?.abort();
        });
      }
    }
  }

  // Ensure we register unmount cleanup to abort current controller
  registerMountOperation(() => {
    return () => {
      const cur = internalState();
      cur._controller?.abort();
    };
  });

  // The captured snapshot is set once at resource creation and preserved
  // for the resource's entire lifetime. Each resource sees a consistent
  // context snapshot from its creation point, unaffected by subsequent renders
  // or other concurrent resources.

  // Return the reused snapshot object (avoid allocating a new object each call)
  return s._snapshot;
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
  // root app instance, do not attach (per contract tests).
  registerMountOperation(() => {
    if (!ownerIsRoot) return;
    target.addEventListener(event, handler);
    // Return cleanup function
    return () => {
      target.removeEventListener(event, handler);
    };
  });
}

export function timer(intervalMs: number, fn: () => void): void {
  const ownerIsRoot = getCurrentComponentInstance()?.isRoot ?? false;
  // Register the timer to be started on mount. Only start timers for root
  // instance to satisfy ownership contract tests.
  registerMountOperation(() => {
    if (!ownerIsRoot) return;
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
  // Register the task to run on mount. Only execute for root instance.
  registerMountOperation(async () => {
    if (!ownerIsRoot) return;
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
