/**
 * Timing and event-scheduling helpers.
 *
 * The timing helpers (`debounce`, `throttle`, `once`, `raf`, `idle`,
 * `timeout`, `retry`) are plain functions with no runtime dependency. The
 * event and `schedule*` helpers use the Askr scheduler and lifecycle ownership.
 * `debounceEvent`, `throttleEvent`, and `rafEvent` reject invocation during
 * render and cancel pending work on owner cleanup. `scheduleEventHandler`
 * runs its handler in the captured owner's scope.
 */

export {
  debounce,
  throttle,
  once,
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

export { scheduleEventHandler } from '../runtime';
