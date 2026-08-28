/**
 * askr/resources — async lifecycle helpers
 *
 * This tier exists to make async lifecycle intent explicit in import paths.
 */

export { resource } from '../runtime';
export { onRouteChange } from '../router/activity';
export type {
  RouteChangeCleanup,
  RouteChangeOptions,
} from '../router/activity';
export {
  documentVisible,
  on,
  routeActive,
  timer,
  task,
  stream,
  capture,
  windowFocused,
  watch,
} from '../runtime';
export type { ResourceResult } from '../runtime';
export type {
  ActivityPredicate,
  ListenerTarget,
  StreamOptions,
  StreamResult,
  StreamStatus,
  TimerOptions,
  WatchCallback,
  WatchContext,
  WatchSource,
  WatchValues,
} from '../runtime';

export { getSignal } from '../runtime';
