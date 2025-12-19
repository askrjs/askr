import {
  getCurrentComponentInstance,
  registerMountOperation,
} from './component';
import { state } from './state';
import { getDeriveCache } from '../shared/derive_cache';

// Memoization cache for derive() (centralized)

export interface DataResult<T> {
  value: T | null;
  pending: boolean;
  error: Error | null;
  refresh(): void;
}

export function data<TInput extends Record<string, unknown>, T>(
  fn: (input: TInput, signal: AbortSignal) => Promise<T>,
  input: TInput
): DataResult<T> {
  // Create state to track the result
  const result = state<DataResult<T>>({
    value: null,
    pending: true,
    error: null,
    refresh: () => {
      // Trigger refresh
      result.set({
        value: result().value,
        pending: true,
        error: null,
        refresh: result().refresh,
      });
      // Re-execute the fetch
      fn(input, new AbortController().signal)
        .then((val) => {
          result.set({
            value: val,
            pending: false,
            error: null,
            refresh: result().refresh,
          });
        })
        .catch((err) => {
          result.set({
            value: result().value,
            pending: false,
            error: err,
            refresh: result().refresh,
          });
        });
    },
  });

  // Register to execute the fetch on mount
  registerMountOperation(() => {
    const controller = new AbortController();
    fn(input, controller.signal)
      .then((val) => {
        result.set({
          value: val,
          pending: false,
          error: null,
          refresh: result().refresh,
        });
      })
      .catch((err) => {
        result.set({
          value: null,
          pending: false,
          error: err,
          refresh: result().refresh,
        });
      });
    // Return cleanup function to abort on unmount
    return () => controller.abort();
  });

  return result();
}

export function derive<TIn, TOut>(
  source:
    | { value: TIn | null; pending?: boolean; error?: Error | null }
    | TIn
    | (() => TIn),
  map: (value: TIn) => TOut
): TOut | null {
  // Extract the actual value using narrow type guards (avoid `any`)
  let value: TIn;

  if (typeof source === 'function' && !('value' in (source as object))) {
    // Plain function returning a value
    value = (source as () => TIn)();
  } else if (
    typeof source === 'object' &&
    source !== null &&
    'value' in source
  ) {
    // Binding-like object with a `value` property
    value = (source as { value: TIn }).value;
  } else {
    // Raw value
    value = source as TIn;
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
  // Register the listener to be attached on mount
  registerMountOperation(() => {
    target.addEventListener(event, handler);
    // Return cleanup function
    return () => {
      target.removeEventListener(event, handler);
    };
  });
}

export function timer(intervalMs: number, fn: () => void): void {
  // Register the timer to be started on mount
  registerMountOperation(() => {
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
  // Register the task to run on mount
  registerMountOperation(async () => {
    // Execute the task (may be async) and return its cleanup
    return await fn();
  });
}
