/**
 * Timing utilities — pure helpers for common async patterns
 * No framework coupling. No lifecycle awareness.
 */

export interface DebounceOptions {
  leading?: boolean;
  trailing?: boolean;
}

export interface ThrottleOptions {
  leading?: boolean;
  trailing?: boolean;
}

export interface RetryOptions {
  maxAttempts?: number;
  delayMs?: number;
  backoff?: (attemptIndex: number) => number;
}

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
export function debounce<T extends (...args: unknown[]) => unknown>(
  fn: T,
  ms: number,
  options?: DebounceOptions
): T & { cancel(): void } {
  let timeoutId: NodeJS.Timeout | null = null;
  const { leading = false, trailing = true } = options || {};
  let lastArgs: unknown[] | null = null;
  let lastThis: unknown = null;
  let lastCallTime = 0;

  const debounced = function (this: unknown, ...args: unknown[]) {
    const callTime = Date.now();
    lastArgs = args;
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    lastThis = this;

    if (timeoutId !== null) {
      clearTimeout(timeoutId);
    }

    if (leading && callTime - lastCallTime >= ms) {
      fn.apply(this, args);
      lastCallTime = callTime;
    }

    if (trailing) {
      timeoutId = setTimeout(() => {
        fn.apply(lastThis, lastArgs!);
        timeoutId = null;
        lastCallTime = Date.now();
      }, ms);
    }
  };

  debounced.cancel = () => {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
  };

  return debounced as T & { cancel(): void };
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
export function throttle<T extends (...args: unknown[]) => unknown>(
  fn: T,
  ms: number,
  options?: ThrottleOptions
): T & { cancel(): void } {
  let lastCallTime = 0;
  let timeoutId: NodeJS.Timeout | null = null;
  const { leading = true, trailing = true } = options || {};
  let lastArgs: unknown[] | null = null;
  let lastThis: unknown = null;

  const throttled = function (this: unknown, ...args: unknown[]) {
    const callTime = Date.now();
    lastArgs = args;
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    lastThis = this;

    if (leading && callTime - lastCallTime >= ms) {
      fn.apply(this, args);
      lastCallTime = callTime;
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
    } else if (!leading && lastCallTime === 0) {
      lastCallTime = callTime;
    }

    if (trailing && timeoutId === null) {
      timeoutId = setTimeout(
        () => {
          fn.apply(lastThis, lastArgs!);
          lastCallTime = Date.now();
          timeoutId = null;
        },
        ms - (callTime - lastCallTime)
      );
    }
  };

  throttled.cancel = () => {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
  };

  return throttled as T & { cancel(): void };
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
export function once<T extends (...args: unknown[]) => unknown>(fn: T): T {
  let called = false;
  let result: unknown;

  return ((...args: unknown[]) => {
    if (!called) {
      called = true;
      result = fn(...args);
    }
    return result;
  }) as T;
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
export function raf<T extends (...args: unknown[]) => unknown>(fn: T): T {
  let frameId: number | null = null;
  let lastArgs: unknown[] | null = null;
  let lastThis: unknown = null;

  return function (this: unknown, ...args: unknown[]) {
    lastArgs = args;
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    lastThis = this;

    if (frameId === null) {
      frameId = requestAnimationFrame(() => {
        fn.apply(lastThis, lastArgs!);
        frameId = null;
      });
    }
  } as T;
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
