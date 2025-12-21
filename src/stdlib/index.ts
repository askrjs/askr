/**
 * Standard library — pure helpers for common patterns
 * Zero framework coupling
 */

export {
  debounce,
  throttle,
  once,
  defer,
  raf,
  idle,
  timeout,
  retry,
  type DebounceOptions,
  type ThrottleOptions,
  type RetryOptions,
} from './timing';

export {
  debounceEvent,
  throttleEvent,
  rafEvent,
  scheduleTimeout,
  scheduleIdle,
  scheduleRetry,
} from './fx';

export { handle, catchError, tryWithLogging } from './errors';
