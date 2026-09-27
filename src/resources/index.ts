/**
 * askr/resources — async lifecycle helpers
 *
 * This tier exists to make async lifecycle intent explicit in import paths.
 */

export { resource } from '../core/api/resource';
export { onRouteChange } from '../router/activity';
export type {
  RouteChangeCleanup,
  RouteChangeOptions,
} from '../router/activity';
export { documentVisible, windowFocused } from './browser-activity';
export {
  capture,
  on,
  routeActive,
  task,
  timer,
  watch,
} from '../core/api/lifecycle';
export { stream } from '../core/api/stream';
export type { ResourceResult } from '../core/api/resource';
export type {
  ActivityPredicate,
  ListenerTarget,
  TimerOptions,
  WatchCallback,
  WatchContext,
  WatchSource,
  WatchValues,
} from '../core/api/lifecycle';
export type {
  StreamOptions,
  StreamResult,
  StreamStatus,
} from '../core/api/stream';

export { getSignal } from '../core/api/state';
