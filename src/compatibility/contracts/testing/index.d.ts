import {
  RouteAuthOptions,
  RouteRegistry,
  RouteMatch,
  ComponentFunction,
  QueryStaleReason,
  Mutation,
  Query,
  DataRuntime,
} from '../core.js';
/** Options for {@link render} and {@link mount}. */
interface RenderOptions {
  /**
   * Existing element to own for the duration of the render. When omitted, the
   * harness appends a managed `<div>` to `document.body`.
   */
  container?: HTMLElement;
  /** Surface lifecycle cleanup errors during unmount. */
  cleanupStrict?: boolean;
  /** Isolated data runtime owned by this component render. */
  dataRuntime?: DataRuntime;
}
/** Options for {@link renderRoute}. */
interface RouteRenderOptions extends RenderOptions {
  registry: RouteRegistry;
  /** Initial path, query, and hash for the routed render. */
  url?: string;
  auth?: RouteAuthOptions;
  dataRuntime?: DataRuntime;
}
type DispatchEventInit =
  | EventInit
  | UIEventInit
  | FocusEventInit
  | MouseEventInit
  | WheelEventInit
  | KeyboardEventInit
  | InputEventInit
  | CompositionEventInit
  | PointerEventInit
  | TouchEventInit
  | DragEventInit;
/** Handle to a mounted test render, returned by {@link render}/{@link mount}/{@link renderRoute}. */
interface RenderResult {
  readonly container: HTMLElement;
  readonly root: HTMLElement;
  flush(): void;
  dispatch(
    target: EventTarget,
    event: Event | string,
    init?: DispatchEventInit
  ): boolean;
  unmount(): void;
  cleanup(): void;
}
/** Synchronously flush the runtime's scheduled work (renders, effects). */
declare function flush(): void;
/** Dispatch an event (constructed from a type string, or given directly) on `target`. */
declare function dispatch(
  target: EventTarget,
  event: Event | string,
  init?: DispatchEventInit
): boolean;
/** Tear down a test render, given either its {@link RenderResult} or container element. */
declare function cleanup(target: RenderResult | HTMLElement): void;
/** Mount `component` as an island into a test container and flush pending work. */
declare function render(
  component: ComponentFunction,
  options?: RenderOptions
): RenderResult;
/** Alias for {@link render}. */
declare function mount(
  component: ComponentFunction,
  options?: RenderOptions
): RenderResult;
/** Mount a routed app (via {@link createSPA}) into a test container for the given route registry. */
declare function renderRoute(
  options: RouteRenderOptions
): Promise<RenderResult>;
/** Dispatch the browser click sequence expected by Askr's delegated events. */
declare function click(element: Element): boolean;
/** Set a text control's value and emit an input event for each character. */
declare function type(
  element: HTMLInputElement | HTMLTextAreaElement,
  text: string
): void;
/** Dispatch a cancelable bubbling submit event on a form. */
declare function submit(form: HTMLFormElement): boolean;
/** Keyed query fixture registry returned by {@link createQueryTestRegistry}. */
interface QueryTestRegistry {
  readonly runtime: DataRuntime;
  set<T extends {}>(key: string, query: Query<T>): void;
  delete(key: string): void;
  clear(): void;
}
/** Create a keyed query fixture registry for a test render runtime. */
declare function createQueryTestRegistry(): QueryTestRegistry;
/** Keyed mutation fixture registry returned by {@link createMutationTestRegistry}. */
interface MutationTestRegistry {
  readonly runtime: DataRuntime;
  set<TInput, TResult>(key: string, mutation: Mutation<TInput, TResult>): void;
  delete(key: string): void;
  clear(): void;
}
/** Create a keyed mutation fixture registry for a test render runtime. */
declare function createMutationTestRegistry(): MutationTestRegistry;
/** Initial state for {@link mutationState}; exactly one of `pending`/`error`/`result` may be set. */
type MutationFixtureInitial<TResult> = {
  pending?: boolean;
  error?: {} | null;
  result?: TResult;
};
/** A {@link Mutation} whose state is driven manually via `setPending`/`succeed`/`fail`. */
type MutationFixture<TInput, TResult> = Mutation<TInput, TResult> & {
  /** Inputs received by the fixture's execute method. */
  readonly inputs: readonly TInput[];
  /** Move the fixture to pending without starting application work. */
  setPending(): void;
  /** Resolve the current fixture execution and expose its result. */
  succeed(result: TResult): void;
  /** Reject the current fixture execution and expose its error. */
  fail(error: {}): void;
};
declare function createMutationFixture<TInput = unknown, TResult = unknown>(
  initial?: MutationFixtureInitial<TResult>
): MutationFixture<TInput, TResult>;
/**
 * Build a {@link MutationFixture} for tests: call directly with initial
 * state, or use `.idle()`/`.pending()`/`.success(result)`/`.error(error)`.
 */
declare const mutationState: typeof createMutationFixture & {
  idle<TInput = unknown, TResult = unknown>(): MutationFixture<TInput, TResult>;
  pending<TInput = unknown, TResult = unknown>(): MutationFixture<
    TInput,
    TResult
  >;
  success<TInput = unknown, TResult = unknown>(
    result: TResult
  ): MutationFixture<TInput, TResult>;
  error<TInput = unknown, TResult = unknown>(error: {}): MutationFixture<
    TInput,
    TResult
  >;
};
/** Refresh callback for a {@link mockQuery} fixture, invoked by the query's `refresh()`. */
type MockRefresh = () => void | Promise<void>;
/** Options for {@link mockQuery} fixtures. */
interface MockQueryOptions {
  refresh?: MockRefresh;
}
/** A single recorded call to {@link invalidate}, captured by {@link createInvalidationRecorder}. */
interface InvalidationRecord {
  prefix: string;
  markPendingWrite: boolean;
}
/** Recorder returned by {@link createInvalidationRecorder}. */
interface InvalidationRecorder {
  readonly calls: readonly InvalidationRecord[];
  readonly prefixes: readonly string[];
  clear(): void;
  stop(): void;
}
interface MatchRouteOptions {
  registry: RouteRegistry;
}
/** A splat-route/static-route path collision reported by {@link getRouteWarnings}. */
interface RoutePatternWarning {
  kind: 'route-collision';
  path: string;
  conflictingPath: string;
  segment: string;
  namespace: string | undefined;
  message: string;
}
type StaleValueReason = Exclude<QueryStaleReason, 'error'>;
declare function createFreshQuery<T extends {}>(
  data: T,
  options?: MockQueryOptions
): Query<T>;
/**
 * Build a fresh {@link Query} fixture for tests: call directly with data, or
 * use `.loading()`/`.error()`/`.refreshing()`/`.stale()`/`.pendingWrite()`.
 */
declare const mockQuery: typeof createFreshQuery & {
  loading<T extends {} = {}>(options?: MockQueryOptions): Query<T>;
  error<T extends {} = {}>(
    error: {},
    previousData?: T,
    options?: MockQueryOptions
  ): Query<T>;
  refreshing<T extends {}>(data: T, options?: MockQueryOptions): Query<T>;
  stale<T extends {}>(
    data: T,
    reason?: StaleValueReason,
    options?: MockQueryOptions
  ): Query<T>;
  pendingWrite<T extends {}>(data: T, options?: MockQueryOptions): Query<T>;
};
/** Alias table mirroring {@link mockQuery}'s state builders (`fresh`, `loading`, `error`, ...). */
declare const queryState: {
  fresh: typeof createFreshQuery;
  loading: <T extends {} = {}>(options?: MockQueryOptions) => Query<T>;
  error: <T extends {} = {}>(
    error: {},
    previousData?: T,
    options?: MockQueryOptions
  ) => Query<T>;
  refreshing: <T extends {}>(data: T, options?: MockQueryOptions) => Query<T>;
  stale: <T extends {}>(
    data: T,
    reason?: StaleValueReason,
    options?: MockQueryOptions
  ) => Query<T>;
  pendingWrite: <T extends {}>(data: T, options?: MockQueryOptions) => Query<T>;
};
/** Start recording {@link invalidate} calls for assertions; call `stop()` when done. */
declare function createInvalidationRecorder(): InvalidationRecorder;
/** Match `path` against a route registry for tests, without mounting the app. */
declare function matchRoute(
  path: string,
  options: MatchRouteOptions
): RouteMatch | null;
/** Find named-splat routes whose reserved segments collide with sibling static routes. */
declare function getRouteWarnings(
  options: MatchRouteOptions
): RoutePatternWarning[];
export {
  InvalidationRecord,
  InvalidationRecorder,
  MockQueryOptions,
  MockRefresh,
  MutationFixture,
  MutationFixtureInitial,
  MutationTestRegistry,
  QueryTestRegistry,
  type RenderOptions,
  type RenderResult,
  RoutePatternWarning,
  type RouteRenderOptions,
  cleanup,
  click,
  createInvalidationRecorder,
  createMutationTestRegistry,
  createQueryTestRegistry,
  dispatch,
  flush,
  getRouteWarnings,
  matchRoute,
  mockQuery,
  mount,
  mutationState,
  queryState,
  render,
  renderRoute,
  submit,
  type,
};
