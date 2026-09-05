export { resource } from './resource-operation';
export type { ResourceResult } from './resource-operation';
export { stream } from './stream-operation';
export type {
  StreamOptions,
  StreamResult,
  StreamStatus,
} from './stream-operation';
export {
  capture,
  on,
  routeActive,
  task,
  timer,
  watch,
} from './lifecycle-operations';
export type {
  ActivityPredicate,
  ListenerTarget,
  TimerOptions,
  WatchCallback,
  WatchContext,
  WatchSource,
  WatchValues,
} from './lifecycle-operations';

export { documentVisible, windowFocused } from '../resources/browser-activity';
