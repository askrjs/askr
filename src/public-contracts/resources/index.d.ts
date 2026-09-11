import {
  routeActive,
  TimerOptions,
  WatchSource,
  WatchCallback,
  on,
  ActivityPredicate,
  ListenerTarget,
  capture,
  WatchValues,
  documentVisible,
  task,
  watch,
  getSignal,
  WatchContext,
  windowFocused,
  timer,
} from '../core.js';
import {
  onRouteChange,
  RouteChangeOptions,
  RouteChangeCleanup,
} from '../route-activity.js';
/** Reactive result of a {@link resource}: current value, loading state, and controls. */
interface ResourceResult<T> {
  value: T | null;
  pending: boolean;
  error: Error | null;
  refresh(): void;
}
/** Creates a render-scoped async resource with cancellation and refresh; SSR has special data rules. */
declare function resource<T, const TDeps extends readonly unknown[]>(
  fn: (opts: { signal: AbortSignal }) => PromiseLike<T> | T,
  deps: TDeps
): ResourceResult<T>;
/** Connection status of a {@link stream}. */
type StreamStatus =
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'closed'
  | 'error';
/** Reactive result of a {@link stream}: current value, connection status, and controls. */
interface StreamResult<T> {
  value: T | null;
  status: StreamStatus;
  pending: boolean;
  stale: boolean;
  error: Error | null;
  restart(): void;
  close(): void;
}
/** Options for {@link stream}. */
interface StreamOptions<T> {
  deps?: readonly unknown[];
  initialValue?: T;
}
type StreamSource<T> = (context: {
  signal: AbortSignal;
}) => AsyncIterable<T> | PromiseLike<AsyncIterable<T>>;
/** Subscribe to a streaming data source for the current component's lifetime, with auto reconnect/cleanup. */
declare function stream<T>(
  source: StreamSource<T>,
  options?: StreamOptions<T>
): StreamResult<T>;
export {
  type ActivityPredicate,
  type ListenerTarget,
  type ResourceResult,
  type RouteChangeCleanup,
  type RouteChangeOptions,
  type StreamOptions,
  type StreamResult,
  type StreamStatus,
  type TimerOptions,
  type WatchCallback,
  type WatchContext,
  type WatchSource,
  type WatchValues,
  capture,
  documentVisible,
  getSignal,
  on,
  onRouteChange,
  resource,
  routeActive,
  stream,
  task,
  timer,
  watch,
  windowFocused,
};
