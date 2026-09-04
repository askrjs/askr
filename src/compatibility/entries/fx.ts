/** Published compatibility boundary. Implementations own execution; contracts own consumer types. */
import * as implementation from '../../fx/index';
import type * as Contract from '../contracts/fx/index';
export type * from '../contracts/fx/index';

const public_debounce: typeof Contract.debounce = implementation.debounce;
const public_debounceEvent: typeof Contract.debounceEvent =
  implementation.debounceEvent;
const public_defer: typeof Contract.defer = implementation.defer;
const public_idle: typeof Contract.idle = implementation.idle;
const public_once: typeof Contract.once = implementation.once;
const public_raf: typeof Contract.raf = implementation.raf;
const public_rafEvent: typeof Contract.rafEvent = implementation.rafEvent;
const public_retry: typeof Contract.retry = implementation.retry;
const public_scheduleEventHandler: typeof Contract.scheduleEventHandler =
  implementation.scheduleEventHandler;
const public_scheduleIdle: typeof Contract.scheduleIdle =
  implementation.scheduleIdle;
const public_scheduleRetry: typeof Contract.scheduleRetry =
  implementation.scheduleRetry;
const public_scheduleTimeout: typeof Contract.scheduleTimeout =
  implementation.scheduleTimeout;
const public_throttle: typeof Contract.throttle = implementation.throttle;
const public_throttleEvent: typeof Contract.throttleEvent =
  implementation.throttleEvent;
const public_timeout: typeof Contract.timeout = implementation.timeout;

export {
  public_debounce as debounce,
  public_debounceEvent as debounceEvent,
  public_defer as defer,
  public_idle as idle,
  public_once as once,
  public_raf as raf,
  public_rafEvent as rafEvent,
  public_retry as retry,
  public_scheduleEventHandler as scheduleEventHandler,
  public_scheduleIdle as scheduleIdle,
  public_scheduleRetry as scheduleRetry,
  public_scheduleTimeout as scheduleTimeout,
  public_throttle as throttle,
  public_throttleEvent as throttleEvent,
  public_timeout as timeout,
};
