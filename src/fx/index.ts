/**
 * Timing and event-scheduling helpers.
 *
 * The timing helpers (`debounce`, `throttle`, `once`, `defer`, `raf`, `idle`,
 * `timeout`, `retry`) are plain functions with no runtime dependency. The
 * event and `schedule*` helpers are runtime-integrated: they run callbacks
 * through the Askr scheduler, tie cancellation to the calling component's
 * lifetime, and reject calls made during render.
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

export { scheduleEventHandler } from '../runtime';
