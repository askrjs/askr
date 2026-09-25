/**
 * Timing utilities — pure helpers for common async patterns
 * No framework coupling. No lifecycle awareness.
 */

/** Options for {@link debounce}. */
export interface DebounceOptions {
  leading?: boolean;
  trailing?: boolean;
}

/** Options for {@link throttle}. */
export interface ThrottleOptions {
  leading?: boolean;
  trailing?: boolean;
}

/** Options for {@link retry}. */
export interface RetryOptions {
  maxAttempts?: number;
  delayMs?: number;
  backoff?: (attemptIndex: number) => number;
}

type AnyFn = (...args: never[]) => unknown;
type Scheduled<T extends AnyFn> = (
  this: ThisParameterType<T>,
  ...args: Parameters<T>
) => void;
type CallableFn = (this: unknown, ...args: unknown[]) => unknown;

type Invoke = (thisArg: unknown, args: unknown[]) => void;

/**
 * @internal Edge logic shared by {@link debounce} and fx `debounceEvent`.
 * A trailing call only runs when a call arrived after the leading call.
 */
export function createDebouncer(
  invoke: Invoke,
  ms: number,
  options?: DebounceOptions
): {
  call(thisArg: unknown, args: unknown[]): void;
  cancel(): void;
  flush(): void;
} {
  const { leading = false, trailing = true } = options || {};
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  let lastArgs: unknown[] | null = null;
  let lastThis: unknown = null;
  let trailingPending = false;

  const clearTimer = () => {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
  };

  const reset = () => {
    trailingPending = false;
    lastArgs = null;
    lastThis = null;
  };

  const runTrailing = () => {
    const pending = trailingPending;
    const args = lastArgs;
    const thisArg = lastThis;
    reset();
    if (pending) invoke(thisArg, args!);
  };

  return {
    call(thisArg, args) {
      const windowActive = timeoutId !== null;
      clearTimer();

      if (leading && !windowActive) {
        reset();
        invoke(thisArg, args);
      } else if (trailing) {
        lastArgs = args;
        lastThis = thisArg;
        trailingPending = true;
      }

      timeoutId = setTimeout(() => {
        timeoutId = null;
        runTrailing();
      }, ms);
    },
    cancel() {
      clearTimer();
      reset();
    },
    flush() {
      if (timeoutId === null) return;
      clearTimer();
      runTrailing();
    },
  };
}

/**
 * @internal Edge logic shared by {@link throttle} and fx `throttleEvent`.
 * A trailing call only runs when a call arrived after the leading call.
 */
export function createThrottler(
  invoke: Invoke,
  ms: number,
  options?: ThrottleOptions
): { call(thisArg: unknown, args: unknown[]): void; cancel(): void } {
  const { leading = true, trailing = true } = options || {};
  let lastCallTime: number | null = null;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  let lastArgs: unknown[] | null = null;
  let lastThis: unknown = null;

  const clearTimer = () => {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
  };

  return {
    call(thisArg, args) {
      const callTime = Date.now();
      const timeSinceLastCall =
        lastCallTime === null
          ? Number.POSITIVE_INFINITY
          : callTime - lastCallTime;

      if (leading && timeSinceLastCall >= ms) {
        clearTimer();
        lastArgs = null;
        lastThis = null;
        lastCallTime = callTime;
        invoke(thisArg, args);
        return;
      }

      if (!trailing) return;
      lastArgs = args;
      lastThis = thisArg;

      // Without a leading edge, a call after an idle gap opens a full window.
      if (!leading && timeSinceLastCall >= ms) {
        lastCallTime = callTime;
      }

      if (timeoutId === null) {
        timeoutId = setTimeout(
          () => {
            timeoutId = null;
            lastCallTime = Date.now();
            const pendingArgs = lastArgs;
            const pendingThis = lastThis;
            lastArgs = null;
            lastThis = null;
            invoke(pendingThis, pendingArgs!);
          },
          // Reaching here means a window is open, so lastCallTime is set.
          Math.max(0, ms - (callTime - lastCallTime!))
        );
      }
    },
    cancel() {
      clearTimer();
      lastArgs = null;
      lastThis = null;
    },
  };
}

const applyTo =
  (callable: CallableFn): Invoke =>
  (thisArg, args) => {
    callable.apply(thisArg, args);
  };

/**
 * Debounce — delay execution, coalesce rapid calls
 *
 * Useful for: text input, resize, autosave
 *
 * @param fn Function to debounce
 * @param ms Delay in milliseconds
 * @param options trailing (default true), leading
 * @returns Debounced function with cancel() method
 *
 * @example
 * ```ts
 * const save = debounce((text) => api.save(text), 500);
 * input.addEventListener('input', (e) => save(e.target.value));
 * save.cancel(); // stop any pending execution
 * ```
 */
export function debounce<T extends AnyFn>(
  fn: T,
  ms: number,
  options?: DebounceOptions
): Scheduled<T> & { cancel(): void } {
  const debouncer = createDebouncer(
    applyTo(fn as unknown as CallableFn),
    ms,
    options
  );

  const debounced = function (this: unknown, ...args: unknown[]) {
    debouncer.call(this, args);
  };
  debounced.cancel = debouncer.cancel;

  return debounced as unknown as Scheduled<T> & { cancel(): void };
}

/**
 * Throttle — rate-limit execution, keep first/last
 *
 * Useful for: scroll, mouse move, high-frequency events
 *
 * @param fn Function to throttle
 * @param ms Minimum interval between calls in milliseconds
 * @param options leading (default true), trailing (default true)
 * @returns Throttled function with cancel() method
 *
 * @example
 * ```ts
 * const handleScroll = throttle(updateUI, 100);
 * window.addEventListener('scroll', handleScroll);
 * handleScroll.cancel();
 * ```
 */
export function throttle<T extends AnyFn>(
  fn: T,
  ms: number,
  options?: ThrottleOptions
): Scheduled<T> & { cancel(): void } {
  const throttler = createThrottler(
    applyTo(fn as unknown as CallableFn),
    ms,
    options
  );

  const throttled = function (this: unknown, ...args: unknown[]) {
    throttler.call(this, args);
  };
  throttled.cancel = throttler.cancel;

  return throttled as unknown as Scheduled<T> & { cancel(): void };
}

/**
 * Once — guard against double execution
 *
 * Useful for: init logic, event safety
 *
 * @param fn Function to call at most once
 * @returns Function that executes fn only on first call
 *
 * @example
 * ```ts
 * const init = once(setup);
 * init(); // runs
 * init(); // does nothing
 * init(); // does nothing
 * ```
 */
export function once<T extends AnyFn>(fn: T): T {
  const callable = fn as unknown as CallableFn;
  let called = false;
  let result: unknown;

  return function (this: unknown, ...args: unknown[]) {
    if (!called) {
      called = true;
      result = callable.apply(this, args);
    }
    return result;
  } as unknown as T;
}

/**
 * Defer — schedule on microtask queue
 *
 * Useful for: run-after-current-stack logic
 * More reliable than setTimeout(..., 0)
 *
 * @param fn Function to defer
 *
 * @example
 * ```ts
 * defer(() => update()); // runs after current stack, before next macrotask
 * ```
 */
export function defer(fn: () => void): void {
  Promise.resolve().then(fn);
}

/**
 * RAF — coalesce multiple updates into single frame
 *
 * Useful for: animation, layout work, render updates
 *
 * @param fn Function to schedule on next animation frame
 * @returns Function that schedules fn on requestAnimationFrame
 *
 * @example
 * ```ts
 * const update = raf(render);
 * update(); // schedules on next frame
 * update(); // same frame, no duplicate
 * ```
 */
export function raf<T extends AnyFn>(fn: T): Scheduled<T> {
  const callable = fn as unknown as CallableFn;
  let frameId: number | null = null;
  let lastArgs: unknown[] | null = null;
  let lastThis: unknown = null;

  return function (this: unknown, ...args: unknown[]) {
    lastArgs = args;
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    lastThis = this;

    if (frameId === null) {
      frameId = requestAnimationFrame(() => {
        callable.apply(lastThis, lastArgs!);
        frameId = null;
      });
    }
  } as unknown as Scheduled<T>;
}

/**
 * Idle — schedule low-priority work
 *
 * Useful for: background prep, non-urgent updates
 * Falls back to setTimeout if requestIdleCallback unavailable
 *
 * @param fn Function to call when idle
 * @param options timeout for fallback
 *
 * @example
 * ```ts
 * idle(() => prefetchData());
 * ```
 */
export function idle(fn: () => void, options?: { timeout?: number }): void {
  if (typeof requestIdleCallback !== 'undefined') {
    requestIdleCallback(fn, options ? { timeout: options.timeout } : undefined);
  } else {
    // Fallback: defer to microtask, then use setTimeout
    Promise.resolve().then(() => {
      setTimeout(fn, 0);
    });
  }
}

/**
 * Timeout — Promise-based delay
 *
 * Useful for: readable async code, waiting between retries
 *
 * @param ms Milliseconds to wait
 * @returns Promise that resolves after delay
 *
 * @example
 * ```ts
 * await timeout(300);
 * console.log('300ms later');
 * ```
 */
export function timeout(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retry — attempt function with backoff
 *
 * Useful for: network calls, transient failures
 *
 * @param fn Async function to retry
 * @param options maxAttempts, delayMs, backoff function
 * @returns Promise with final result or error
 *
 * @example
 * ```ts
 * const data = await retry(() => fetch(url), {
 *   maxAttempts: 3,
 *   delayMs: 100,
 * });
 * ```
 */
export async function retry<T>(
  fn: () => Promise<T>,
  options?: RetryOptions
): Promise<T> {
  const {
    maxAttempts = 3,
    delayMs = 100,
    backoff = (i: number) => delayMs * Math.pow(2, i),
  } = options || {};

  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      if (attempt < maxAttempts - 1) {
        const delay = backoff(attempt);
        await timeout(delay);
      }
    }
  }

  throw lastError || new Error('Retry failed');
}
