import { scheduleEventHandler } from '../core.js';
/**
 * Timing utilities — pure helpers for common async patterns
 * No framework coupling. No lifecycle awareness.
 */
/** Options for {@link debounce}. */
interface DebounceOptions {
  leading?: boolean;
  trailing?: boolean;
}
/** Options for {@link throttle}. */
interface ThrottleOptions {
  leading?: boolean;
  trailing?: boolean;
}
/** Options for {@link retry}. */
interface RetryOptions {
  maxAttempts?: number;
  delayMs?: number;
  backoff?: (attemptIndex: number) => number;
}
type AnyFn = (...args: never[]) => unknown;
type Scheduled<T extends AnyFn> = (
  this: ThisParameterType<T>,
  ...args: Parameters<T>
) => void;
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
declare function debounce<T extends AnyFn>(
  fn: T,
  ms: number,
  options?: DebounceOptions
): Scheduled<T> & {
  cancel(): void;
};
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
declare function throttle<T extends AnyFn>(
  fn: T,
  ms: number,
  options?: ThrottleOptions
): Scheduled<T> & {
  cancel(): void;
};
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
declare function once<T extends AnyFn>(fn: T): T;
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
declare function defer(fn: () => void): void;
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
declare function raf<T extends AnyFn>(fn: T): Scheduled<T>;
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
declare function idle(
  fn: () => void,
  options?: {
    timeout?: number;
  }
): void;
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
declare function timeout(ms: number): Promise<void>;
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
declare function retry<T>(
  fn: () => Promise<T>,
  options?: RetryOptions
): Promise<T>;
type CancelFn = () => void;
/** Wrap an event handler so rapid events are coalesced and delayed by `ms`. */
declare function debounceEvent(
  ms: number,
  handler: EventListener,
  options?: {
    leading?: boolean;
    trailing?: boolean;
  }
): EventListener & {
  cancel(): void;
  flush(): void;
};
/** Wrap an event handler so it runs at most once per `ms` interval. */
declare function throttleEvent(
  ms: number,
  handler: EventListener,
  options?: {
    leading?: boolean;
    trailing?: boolean;
  }
): EventListener & {
  cancel(): void;
};
/** Wrap an event handler so it runs at most once per animation frame, using the latest event. */
declare function rafEvent(handler: EventListener): EventListener & {
  cancel(): void;
};
/** Schedule `fn` after `ms`, auto-cancelling on component cleanup; returns a cancel function. */
declare function scheduleTimeout(ms: number, fn: () => void): CancelFn;
/** Schedule `fn` during browser idle time, auto-cancelling on component cleanup. */
declare function scheduleIdle(
  fn: () => void,
  options?: {
    timeout?: number;
  }
): CancelFn;
interface RetryOptions$1 {
  maxAttempts?: number;
  delayMs?: number;
  backoff?: (attemptIndex: number) => number;
}
/** Run `fn`, retrying with backoff on failure, auto-cancelling on component cleanup. */
declare function scheduleRetry<T>(
  fn: () => Promise<T>,
  options?: RetryOptions$1
): {
  cancel(): void;
};
export {
  type DebounceOptions,
  type RetryOptions,
  type ThrottleOptions,
  debounce,
  debounceEvent,
  defer,
  idle,
  once,
  raf,
  rafEvent,
  retry,
  scheduleEventHandler,
  scheduleIdle,
  scheduleRetry,
  scheduleTimeout,
  throttle,
  throttleEvent,
  timeout,
};
