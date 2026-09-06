export { resource } from './lifecycle/resource';
export type { ResourceResult } from './lifecycle/resource';
export { stream } from './lifecycle/stream';
export type {
  StreamOptions,
  StreamResult,
  StreamStatus,
} from './lifecycle/stream';
export {
  capture,
  on,
  routeActive,
  task,
  timer,
  watch,
} from './lifecycle/operations';
export type {
  ActivityPredicate,
  ListenerTarget,
  TimerOptions,
  WatchCallback,
  WatchContext,
  WatchSource,
  WatchValues,
} from './lifecycle/operations';

export { documentVisible, windowFocused } from '../resources/browser-activity';
