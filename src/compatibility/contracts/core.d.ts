import { JSXElementType, JSXElement, Props } from './elements.js';
import './jsx-globals.js';
import { AuthContext, AuthRequirement } from '@askrjs/auth';
import { InferSchema, ObjectSchema } from '@askrjs/schema';
/**
 * State value holder - callable to read, has set method to update
 * @example
 * const count = state(0);
 * count();           // read: 0
 * count.set(1);      // write: triggers re-render
 */
interface State<T> extends ReadableSource<T> {
  (): T;
  set(...args: StateSetterArgs<T>): void;
  [Symbol.iterator](): IterableIterator<StateTuple<T>[number]>;
}
type StateUpdater<T> = (prev: T) => T;
type StateSetterArgs<T> = [Extract<T, (...args: any[]) => unknown>] extends [
  never,
]
  ? [value: T] | [updater: StateUpdater<T>]
  : [updater: StateUpdater<T>];
/**
 * Public setter type for state cells.
 */
type StateSetter<T> = (...args: StateSetterArgs<T>) => void;
/**
 * Tuple-first state handle returned by `state()`.
 */
type StateTuple<T> = [get: State<T>, set: StateSetter<T>] & State<T>;
/**
 * Creates a local state value for a component
 * Optimized for:
 * - O(1) read performance
 * - Minimal allocation per state
 * - Fast scheduler integration
 *
 * IMPORTANT: state() must be called during component render execution.
 * It captures the current component instance from context.
 * Calling outside a component function will throw an error.
 *
 * @example
 * ```ts
 * // ✅ Correct: called during render
 * export function Counter() {
 *   const [count, setCount] = state(0);
 *   return { type: 'button', children: [count()] };
 * }
 *
 * // ❌ Wrong: called outside component
 * const count = state(0);
 * export function BadComponent() {
 *   return { type: 'div' };
 * }
 * ```
 */
declare function state<T>(initialValue: T): StateTuple<T>;
/**
 * Common call contracts: SSR types
 */
/** Arbitrary serializable data attached to an SSR render pass (e.g. loader output). */
type SSRData = Record<string, unknown>;
/** Styles produced while rendering a request, kept with that request's SSR context. */
interface SSRStyleRegistration {
  id: string;
  cssText: string;
}
interface DocumentRenderRoute {
  path: string;
  namespace?: string;
}
/** Request/render metadata passed to a {@link DocumentRenderer}. */
interface DocumentRenderContext {
  mode: 'ssr' | 'ssg';
  url: string;
  pathname: string;
  search: string;
  hash: string;
  params: Record<string, string>;
  data?: SSRData;
  seed: number;
  route: DocumentRenderRoute;
  cspNonce?: string;
  styles?: readonly SSRStyleRegistration[];
}
/** Arguments passed to a {@link DocumentRenderer}: the rendered app HTML and its context. */
interface DocumentRenderArgs {
  appHtml: string;
  context: DocumentRenderContext;
}
/** Wraps rendered app HTML in a full document (`<html>`, `<head>`, etc.) for SSR/SSG output. */
type DocumentRenderer = (args: DocumentRenderArgs) => string;
/** How to react when SSR styles were registered but not included in the rendered document. */
type SSRStyleRegistrationValidation = 'warn' | 'error' | 'off';
/** Full context for sink-based streaming SSR */
type SSRContext = {
  url: string;
  seed: number;
  data?: SSRData;
  params?: Record<string, string>;
  signal?: AbortSignal;
};
interface DOMElement {
  type: JSXElementType;
  props?: Props;
  children?: VNode[];
  key?: string | number | null;
  [Symbol.iterator]?: never;
  _controlState?: ControlBoundaryState;
}
type VNode = DOMElement | string | number | boolean | null | undefined;
type RenderableChild = VNode | JSXElement | readonly RenderableChild[];
type ComponentContext = {
  signal: AbortSignal;
  ssr?: SSRContext;
};
type ComponentFunction = (
  props: Props,
  context?: ComponentContext
) => JSXElement | VNode;
type ContextKey = symbol;
type Renderable = RenderableChild;
type ContextScopeChildren = Renderable | (() => Renderable);
/** A lexical scope created by {@link defineScope}; render it as a provider component, read it with {@link readScope}. */
interface Scope<T> {
  (props: { value: T; children?: ContextScopeChildren }): JSXElement;
  readonly key: ContextKey;
  readonly defaultValue: T;
}
interface ContextFrame {
  parent: ContextFrame | null;
  values: Map<ContextKey, unknown> | null;
}
/** Create a new lexical {@link Scope} with `defaultValue`, readable via {@link readScope}. */
declare function defineScope<T>(defaultValue: T): Scope<T>;
/** Read the current value of a {@link Scope} during component render or an async resource. */
declare function readScope<T>(context: Scope<T>): T;
type OwnedChildScope = {
  key: string | number;
  dispose(): void;
};
/** Freshness classification for a {@link Query}'s current data. */
type QueryConsistency = 'fresh' | 'stale' | 'refreshing' | 'pending-write';
/** Why a {@link Query} is stale. */
type QueryStaleReason = 'aborted' | 'error' | 'inconsistent';
/** Isolated cache/state container backing queries and mutations, e.g. one per test or request. */
interface DataRuntime {
  readonly queryCache: Map<string, unknown>;
  readonly queryData: Map<string, unknown>;
  /** Test-only query overrides keyed by the canonical query key. */
  readonly queryTestOverrides: Map<string, unknown>;
  /** Test-only mutation overrides keyed by the canonical mutation key. */
  readonly mutationTestOverrides: Map<string, unknown>;
}
/** Options for {@link createDataRuntime}. */
interface DataRuntimeOptions {
  queryCache?: Map<string, unknown>;
  queryData?: Map<string, unknown>;
  queryTestOverrides?: Map<string, unknown>;
  mutationTestOverrides?: Map<string, unknown>;
}
/** Reusable query definition for {@link defineQuery}: key, fetcher, and freshness checks. */
interface QueryDefinition<TInput, TResult extends {}> {
  readonly key: (input: TInput) => string;
  readonly fetch: (
    context: TInput & {
      signal: AbortSignal;
    }
  ) => Promise<TResult>;
  readonly isConsistent?: (data: TResult) => boolean;
  readonly reconcile?: (
    data: TResult,
    context: {
      key: string;
    }
  ) => Promise<boolean> | boolean;
}
/** Stable identity for one member of a {@link QueryCollection}. */
type QueryCollectionKey = string | number | symbol;
/** One keyed input and its underlying cache-backed query reader. */
interface QueryCollectionEntry<
  TInput,
  TResult extends {},
  TKey extends QueryCollectionKey = string,
> {
  readonly key: TKey;
  readonly input: TInput;
  readonly query: Query<TResult>;
}
/** Options for {@link createQueryCollection}. */
interface QueryCollectionOptions<
  TInput,
  TResult extends {},
  TKey extends QueryCollectionKey = string,
> {
  readonly query: QueryDefinition<TInput, TResult>;
  readonly inputs: () => readonly TInput[];
  readonly key: (input: TInput) => TKey;
  readonly concurrency?: number;
  readonly runtime?: DataRuntime;
}
/** Aggregate reactive state for a lifecycle-owned dynamic query collection. */
interface QueryCollection<
  TInput,
  TResult extends {},
  TKey extends QueryCollectionKey = string,
> {
  readonly entries: readonly QueryCollectionEntry<TInput, TResult, TKey>[];
  readonly loading: boolean;
  readonly settled: boolean;
  readonly results: ReadonlyMap<TKey, TResult>;
  readonly errors: ReadonlyMap<TKey, {}>;
  get(key: TKey): QueryCollectionEntry<TInput, TResult, TKey> | undefined;
  retry(key: TKey): Promise<void>;
}
/** Context passed to server prefetch callbacks, exposing a scoped `prefetch` helper. */
interface QueryPrefetchContext {
  readonly runtime: DataRuntime;
  readonly request?: Request;
  readonly signal: AbortSignal;
  readonly mode: 'ssr' | 'spa';
  prefetch<TInput, TResult extends {}>(
    query: QueryDefinition<TInput, TResult>,
    input: TInput
  ): Promise<boolean>;
}
/** Server-side handler that resolves a {@link QueryDefinition}'s data for `serveQuery`. */
type ServerQueryHandler<TInput, TResult extends {}> = (context: {
  input: TInput;
  request?: Request;
  signal: AbortSignal;
}) => Promise<TResult> | TResult;
/** Options for {@link invalidate} and {@link QueryScope.invalidate}. */
interface InvalidateOptions {
  markPendingWrite?: boolean;
  runtime?: DataRuntime;
}
/** Options for {@link invalidateOnInterval}. */
interface InvalidateOnIntervalOptions extends InvalidateOptions {
  intervalMs: number;
  activeOn?: string | readonly string[];
  visibleOnly?: boolean;
  focusedOnly?: boolean;
}
/** A JSON-serializable value usable as part of a query key or invalidation prefix. */
type QueryKeyPart =
  | string
  | number
  | boolean
  | null
  | undefined
  | readonly QueryKeyPart[]
  | {
      readonly [key: string]: QueryKeyPart;
    };
/** Namespaced key-building and invalidation helper returned by {@link queryScope}. */
interface QueryScope {
  key(...parts: QueryKeyPart[]): string;
  prefix(...parts: QueryKeyPart[]): string;
  invalidate(parts: readonly QueryKeyPart[], options?: InvalidateOptions): void;
}
type QueryControls = {
  refresh(): Promise<void>;
};
type QueryLoading = {
  data: null;
  error: null;
  loading: true;
  refreshing: false;
  stale: false;
  consistency: 'fresh';
  staleReason: null;
};
type QueryFresh<T> = {
  data: T;
  error: null;
  loading: false;
  refreshing: false;
  stale: false;
  consistency: 'fresh';
  staleReason: null;
};
type QueryRefreshing<T> = {
  data: T;
  error: null;
  loading: false;
  refreshing: true;
  stale: true;
  consistency: 'refreshing';
  staleReason: null;
};
type QueryPendingWrite<T> = {
  data: T;
  error: null;
  loading: false;
  refreshing: true;
  stale: true;
  consistency: 'pending-write';
  staleReason: null;
};
type QueryStaleValue<T> = {
  data: T;
  error: null;
  loading: false;
  refreshing: false;
  stale: true;
  consistency: 'stale';
  staleReason: 'aborted' | 'inconsistent';
};
type QueryStaleErrorWithValue<T> = {
  data: T;
  error: {};
  loading: false;
  refreshing: false;
  stale: true;
  consistency: 'stale';
  staleReason: 'error';
};
type QueryStaleError = {
  data: null;
  error: {};
  loading: false;
  refreshing: false;
  stale: true;
  consistency: 'stale';
  staleReason: 'error';
};
/** Reactive read state for a query cell: data, loading/refresh flags, and freshness. */
type Query<T extends {}> = QueryControls &
  (
    | QueryLoading
    | QueryFresh<T>
    | QueryRefreshing<T>
    | QueryPendingWrite<T>
    | QueryStaleValue<T>
    | QueryStaleErrorWithValue<T>
    | QueryStaleError
  );
type MutationControls<TInput, TResult> = {
  execute(input: TInput): Promise<TResult>;
  abort(): void;
  reset(): void;
};
type MutationIdle = {
  status: 'idle';
  pending: false;
  error: null;
  result: null;
};
type MutationPending = {
  status: 'pending';
  pending: true;
  error: null;
  result: null;
};
type MutationSuccess<TResult> = {
  status: 'success';
  pending: false;
  error: null;
  result: TResult;
};
type MutationError = {
  status: 'error';
  pending: false;
  error: {};
  result: null;
};
/** Reactive state for a mutation cell: status, error/result, and execute/abort/reset controls. */
type Mutation<TInput, TResult> = MutationControls<TInput, TResult> &
  (MutationIdle | MutationPending | MutationSuccess<TResult> | MutationError);
type QueryOptions<T> = {
  key: string;
  fetch: (ctx: { signal: AbortSignal }) => Promise<T>;
  isConsistent?: (data: T) => boolean;
  reconcile?: (
    data: T,
    ctx: {
      key: string;
    }
  ) => Promise<boolean> | boolean;
  runtime?: DataRuntime;
  initialData?: T;
  skipInitialFetch?: boolean;
};
/** Options for {@link createMutation}. */
type MutationOptions<TInput, TResult> = {
  /** Stable identity used by runtime-scoped mutation test overrides. */
  key?: string;
  action: (
    input: TInput,
    ctx: {
      signal: AbortSignal;
    }
  ) => Promise<TResult>;
  affects?: (input: TInput, result: TResult) => string[];
  afterSuccess?: 'invalidate';
  runtime?: DataRuntime;
};
interface TelemetryFields {
  requestId?: string;
  traceId?: string;
  route?: string;
  action?: string;
  operation?: string;
  status?: number;
  durationMs?: number;
}
type TelemetrySpan = <T>(fields: TelemetryFields, work: () => T) => T;
/**
 * Structural subset implemented by `createTelemetry()` from `@askrjs/otel`.
 * Core does not install an OpenTelemetry SDK, backend, or exporter.
 */
interface CoreTelemetry {
  routeMatch?: TelemetrySpan;
  loader?: TelemetrySpan;
  queryPrefetch?: TelemetrySpan;
  ssrRender?: TelemetrySpan;
}
/**
 * Common call contracts: Router types
 */
/** Path parameters captured for a matched route, keyed by parameter name. */
type RouteParams = Record<string, string>;
type StripRoutePathSuffix<Path extends string> =
  Path extends `${infer Base}?${string}`
    ? StripRoutePathSuffix<Base>
    : Path extends `${infer Base}#${string}`
      ? StripRoutePathSuffix<Base>
      : Path;
type TrimRoutePathSlashes<Path extends string> = Path extends `/${infer Rest}`
  ? TrimRoutePathSlashes<Rest>
  : Path extends `${infer Rest}/`
    ? TrimRoutePathSlashes<Rest>
    : Path;
type TrimRoutePathWhitespace<Path extends string> =
  Path extends `${' ' | '\n' | '\t' | '\r'}${infer Rest}`
    ? TrimRoutePathWhitespace<Rest>
    : Path extends `${infer Rest}${' ' | '\n' | '\t' | '\r'}`
      ? TrimRoutePathWhitespace<Rest>
      : Path;
type ExtractRouteSegmentParam<Segment extends string> =
  Segment extends `{${infer Param}}`
    ? TrimRoutePathWhitespace<Param> extends `*${infer SplatParam}`
      ? TrimRoutePathWhitespace<SplatParam> extends ''
        ? never
        : TrimRoutePathWhitespace<SplatParam> extends '*'
          ? never
          : TrimRoutePathWhitespace<SplatParam>
      : TrimRoutePathWhitespace<Param> extends ''
        ? never
        : TrimRoutePathWhitespace<Param>
    : Segment extends '*'
      ? '*'
      : never;
type ExtractRoutePathParamNames<Path extends string> =
  TrimRoutePathSlashes<
    StripRoutePathSuffix<Path>
  > extends `${infer Segment}/${infer Rest}`
    ? ExtractRouteSegmentParam<Segment> | ExtractRoutePathParamNames<Rest>
    : ExtractRouteSegmentParam<
        TrimRoutePathSlashes<StripRoutePathSuffix<Path>>
      >;
/** Statically infers the param record shape from a route path string literal, e.g. `/posts/{id}`. */
type RoutePathParams<Path extends string> = [
  ExtractRoutePathParamNames<Path>,
] extends [never]
  ? Record<never, string>
  : {
      [Key in ExtractRoutePathParamNames<Path>]: string;
    };
/**
 * A route page component: a regular component that receives route params as
 * props derived from the URL pattern.
 *
 * Components may accept no params at all — zero-argument components are still
 * assignable.
 */
type RouteComponent<TParams extends RouteParams = RouteParams> = (
  props: TParams
) => RenderableChild;
/** The rendering mode a route is currently being evaluated under. */
type RouteMode = 'spa' | 'ssr' | 'ssg';
type AccessRedirectStatus = 301 | 302 | 303 | 307 | 308;
type AccessDenyStatus = 401 | 403 | 404;
interface AccessAllowDecision {
  kind: 'allow';
}
/** Policy decision produced by {@link redirect}: sends the visitor to another URL. */
interface AccessRedirectDecision {
  kind: 'redirect';
  to: string;
  status?: AccessRedirectStatus;
  replace?: boolean;
}
/** Policy decision produced by {@link deny}/{@link unauthorized}/{@link forbidden}/{@link notFound}. */
interface AccessDenyDecision {
  kind: 'deny';
  status: AccessDenyStatus;
}
/** Outcome of a {@link RoutePolicy} evaluation: allow, redirect, or deny. */
type AccessDecision =
  | AccessAllowDecision
  | AccessRedirectDecision
  | AccessDenyDecision;
/** Context passed to route policies, auth resolvers, and loaders. */
interface RouteContext<TParams extends RouteParams = RouteParams> {
  mode: RouteMode;
  params: TParams;
  pathname: string;
  search: string;
  hash: string;
  href: string;
  auth: AuthContext;
  signal: AbortSignal;
}
/** A route access-control check, evaluated against {@link RouteContext} to produce an {@link AccessDecision}. */
type RoutePolicy = (
  context: RouteContext
) => AccessDecision | PromiseLike<AccessDecision>;
/** Resolves the {@link AuthContext} for a route request. */
type RouteAuthResolver = (
  context: Omit<RouteContext, 'auth'>
) => AuthContext | PromiseLike<AuthContext>;
/** Auth configuration shared across a route registry or a single route. */
interface RouteAuthOptions {
  resolve: RouteAuthResolver;
  loginPath?:
    | string
    | ((context: RouteContext) => string | PromiseLike<string>);
  authenticatedRedirectTo?:
    | string
    | ((context: RouteContext) => string | PromiseLike<string>);
}
interface CommonAccessOptions {
  auth?: AuthRequirement;
  policies?: readonly RoutePolicy[];
}
/** A route's metadata, or a function computing it from the resolved context. */
type RouteMetaSource<TParams extends RouteParams = RouteParams> =
  | RouteMeta
  | ((context: RouteContext<TParams>) => RouteMeta | PromiseLike<RouteMeta>);
/**
 * Options for `route()` declarations.
 *
 * - `loader`: server data loader called before render, result passed as SSR data
 * - `entries`: SSG entry generator — returns one param map per static page
 * - `title`: page title hint used by SSG and document-meta integrations
 * - `namespace`: MFE namespace key for grouped route management
 */
interface RouteOptions<
  TParams extends RouteParams = RouteParams,
  TSearchSchema extends ObjectSchema<RouteSearch> | undefined =
    | ObjectSchema<RouteSearch>
    | undefined,
  TLoaderData = unknown,
  TDehydratedData = TLoaderData,
> extends CommonAccessOptions {
  loader?: (
    context: RouteContext<TParams> & {
      request?: Request;
    }
  ) => TLoaderData | PromiseLike<TLoaderData>;
  /**
   * Select the loader data transported to the browser for initial hydration.
   *
   * Server rendering still receives the complete loader value. The selector
   * must be synchronous; client navigations rerun the loader and receive its
   * complete result.
   */
  dehydrate?: (
    data: TLoaderData,
    context: RouteContext<TParams> & {
      request?: Request;
    }
  ) => TDehydratedData extends PromiseLike<unknown> ? never : TDehydratedData;
  preload?: (
    context: RouteContext<TParams> & {
      request?: Request;
      data: QueryPrefetchContext;
    }
  ) => unknown;
  entries?: () => Array<TParams> | Promise<Array<TParams>>;
  /** Optional invalidation keys used by incremental SSG generation. */
  invalidationKeys?: readonly string[];
  title?: string;
  namespace?: string;
  search?: TSearchSchema;
  meta?: RouteMetaSource<TParams>;
  actions?: readonly ActionDescriptor[];
}
interface RouteMeta {
  title?: string;
  description?: string;
  canonical?: string;
  robots?: string;
  openGraph?: Record<string, string>;
  links?: readonly {
    rel: string;
    href: string;
    [key: string]: string;
  }[];
  jsonLd?: unknown | readonly unknown[];
  html?: {
    lang?: string;
    dir?: 'ltr' | 'rtl' | 'auto';
  };
}
/** A stable, typed reference returned by route() for destination construction. */
type RouteSearchValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | readonly (string | number | boolean | null)[];
/** A route's query-string parameters, keyed by name. */
type RouteSearch = Record<string, RouteSearchValue>;
/** Stable, typed reference to a route returned by `route()`, used to build destinations. */
interface RouteRef<
  TParams extends RouteParams = RouteParams,
  TSearch = RouteSearch,
> {
  readonly path: string;
  /** @internal Executable schema retained for destination validation. */
  readonly searchSchema?: ObjectSchema<TSearch & RouteSearch>;
  /** @internal Public mount point captured by createRouteRegistry(). */
  readonly basePath?: string;
  readonly __params?: TParams;
  readonly __search?: TSearch;
}
type RouteRefSearch<TSchema extends ObjectSchema<RouteSearch> | undefined> =
  TSchema extends ObjectSchema<RouteSearch>
    ? InferSchema<TSchema>
    : RouteSearch;
/** A resolved navigation target with a computed `href`, produced by {@link to}. */
interface RouteDestination {
  readonly href: string;
}
/** Options accepted by the `page()` route-declaration helper. */
interface PageHelperOptions extends CommonAccessOptions {
  preload?: (
    context: RouteContext & {
      request?: Request;
      data: QueryPrefetchContext;
    }
  ) => unknown;
  meta?: RouteMetaSource;
}
/**
 * A single parsed segment from a route path.
 *
 * - `static`:   a literal path segment, e.g. `"users"` in `/users/{id}`
 * - `param`:    a `{name}` capture group — `value` holds the param name
 * - `wildcard`: a bare `*` segment that captures exactly one segment
 * - `splat`:    a `{*name}` capture group that captures the remaining path
 * - `catchall`: the `/*` catch-all that matches any depth
 */
interface ParsedSegment {
  kind: 'static' | 'param' | 'wildcard' | 'splat' | 'catchall';
  /** For static/wildcard/catchall: the literal text; for param: the param name. */
  value: string;
}
/** Resolved layout component as stored in a route record's layout chain. */
interface LayoutScopeRecord {
  component: (props: { children?: RenderableChild }) => RenderableChild;
}
/** Resolved page host component as stored in a route record's page chain. */
interface PageScopeRecord {
  component: RouteComponent;
}
/** Options for {@link createRouteRegistry}. */
interface RouteRegistryOptions {
  auth?: RouteAuthOptions;
  /** Public pathname prefix for applications mounted below the origin root. */
  basePath?: string;
}
/** A callback that declares routes via `route()`/`page()`/`group()`, passed to {@link createRouteRegistry}. */
type RouteDefinition = () => void;
/** Options for resolving a route request (used internally by `createSPA`/`hydrateSPA`/SSR). */
interface RouteRequestOptions {
  /** Explicit route source shared by the application renderers. */
  registry: RouteRegistry;
  mode?: RouteMode;
  /** @internal Hydration adopts server loader data instead of rerunning it. */
  load?: boolean;
  auth?: RouteAuthOptions;
  authContext?: AuthContext;
  signal?: AbortSignal;
  request?: Request;
  telemetry?: CoreTelemetry;
}
/** A resolved route request that should render `handler` with `params`. */
interface RouteRenderResult<TParams extends RouteParams = RouteParams> {
  kind: 'render';
  handler: RouteHandler<TParams>;
  params: TParams;
  record?: RouteRecord;
}
/** Outcome of resolving a route request: render, redirect, deny, or no match. */
type RouteRequestResult<TParams extends RouteParams = RouteParams> =
  | RouteRenderResult<TParams>
  | AccessRedirectDecision
  | AccessDenyDecision
  | null;
/** Options accepted by the `group()` route-declaration helper. */
interface GroupHelperOptions extends CommonAccessOptions {
  layout?: (props: { children?: RenderableChild }) => RenderableChild;
  meta?: RouteMetaSource;
}
/**
 * A fully normalized route record produced by `route(path, Component, options?)`.
 *
 * This is the canonical representation shared by:
 *   - SPA matching and navigation
 *   - SSR request resolution
 *   - SSG manifest expansion
 */
interface RouteRecord {
  /** Canonical normalized absolute path, e.g. `/posts/{slug}` */
  path: string;
  /** The page component to render when this route is active */
  component: RouteComponent;
  /** Pre-parsed segment list for fast matching and typed param extraction */
  segments: ParsedSegment[];
  /** Pre-computed specificity rank (higher = more specific) */
  rank: number;
  /** Layout chain from outermost to innermost, applied automatically on render */
  layoutChain: LayoutScopeRecord[];
  /** Page chain from outermost to innermost, composed through Outlet before layouts apply */
  pageChain: PageScopeRecord[];
  /** Route metadata: loader, entries, policies, title, namespace */
  options: RouteOptions;
  /** Metadata sources ordered from outermost group/page to the route leaf. */
  metaChain?: readonly RouteMetaSource[];
  /** True when this is the `/*` catch-all fallback route */
  isFallback: boolean;
  /**
   * Runtime-ready handler with layout composition baked in.
   * Compatible with the low-level `RouteHandler` signature so that navigation
   * and SSR rendering do not need to know about layout chains.
   */
  handler: RouteHandler;
}
/**
 * The normalized route manifest produced by registered route definitions.
 * declarations.  Pass it to `createSPA`, `hydrateSPA`, or `renderToString`
 * instead of assembling plain `Route[]` arrays.
 *
 * ```ts
 * import { createRouteRegistry } from '@askrjs/askr/router';
 * const registry = createRouteRegistry(() => { ... });
 * await createSPA({ root: '#app', registry });
 * ```
 */
interface RouteManifest {
  records: RouteRecord[];
  auth?: RouteAuthOptions;
  /** Normalized public pathname prefix. Empty and root mounts omit it. */
  basePath?: string;
}
declare const routeRegistryBrand: unique symbol;
/** A function rendering a matched route's page content, with layouts already composed. */
interface RouteHandler<TParams extends RouteParams = RouteParams> {
  (
    params: TParams,
    context?: {
      signal: AbortSignal;
    }
  ): RenderableChild;
}
/** A single path-to-handler binding as seen by low-level navigation code. */
interface Route<TParams extends RouteParams = RouteParams> {
  path: string;
  handler: RouteHandler<TParams>;
  namespace?: string;
}
/** Opaque handle produced by {@link createRouteRegistry}, required by `createSPA`/`hydrateSPA`. */
interface RouteRegistry {
  /** Internal brand: registries must come from createRouteRegistry(). */
  readonly [routeRegistryBrand]: true;
  manifest: RouteManifest;
  routes: readonly Route[];
}
/** A single matched route, as reported by {@link currentRoute} and activity predicates. */
interface RouteMatch<TParams extends RouteParams = RouteParams> {
  path: string;
  params: Readonly<TParams>;
  name?: string;
  namespace?: string;
}
/** Read-only accessor for the current route's query-string parameters. */
interface RouteQuery {
  get(key: string): string | null;
  getAll(key: string): string[];
  has(key: string): boolean;
  toJSON(): Record<string, string | string[]>;
}
/** Full description of the currently active route, returned by {@link currentRoute}. */
interface RouteSnapshot<
  TParams extends RouteParams = RouteParams,
  TState = unknown,
> {
  path: string;
  params: Readonly<TParams>;
  query: Readonly<RouteQuery>;
  hash: string | null;
  /** Whether the current browser history entry was given explicit location state. */
  hasState: boolean;
  /** Entry-local state supplied to navigate(); absent during SSR and when no state was supplied. */
  state: TState | undefined;
  name?: string;
  namespace?: string;
  matches: readonly RouteMatch<TParams>[];
}
interface AppRenderRuntime {
  framework: Readonly<Record<string, unknown>>;
  route: unknown;
  hasRoute: boolean;
  dataRuntime?: DataRuntime;
  routeRegistry?: RouteRegistry;
  routeAuth?: RouteAuthOptions;
}
interface ComponentInstance {
  id: string;
  fn: ComponentFunction;
  props: Props;
  target: Element | null;
  parentInstance: ComponentInstance | null;
  portalScope: object | null;
  mounted: boolean;
  abortController: AbortController | null;
  ssr?: boolean;
  cleanupStrict?: boolean;
  /** @internal Private resource-ownership identity for the active mount. */
  _ownershipGeneration: object;
  stateValues?: State<unknown>[];
  evaluationGeneration: number;
  notifyUpdate: (() => void) | null;
  _pendingFlushTask?: () => void;
  _pendingRunTask?: () => void;
  _enqueueRun?: () => void;
  stateIndexCheck: number;
  expectedStateIndices?: number[];
  firstRenderComplete: boolean;
  mountOperations?: Array<
    () => void | (() => void) | PromiseLike<void | (() => void)>
  >;
  commitOperations?: Array<
    () => void | (() => void) | PromiseLike<void | (() => void)>
  >;
  cleanupFns?: Array<() => void>;
  lifecycleSlots?: unknown[];
  lifecycleGeneration: number;
  hasPendingUpdate: boolean;
  ownerFrame: ContextFrame | null;
  isRoot?: boolean;
  _rootComponentFn?: ComponentFunction;
  /** @internal Browser-owned hydration and route state for this app root. */
  _appRenderRuntime?: AppRenderRuntime;
  /** @internal CSP nonce retained across browser route navigation. */
  _cspNonce?: string;
  _vnodeOwner?: object;
  _vnodeParent?: ComponentInstance | null;
  _vnodeParentGeneration?: object;
  _vnodeKey?: string | number;
  _vnodePosition?: number;
  _wrapperDepth?: number;
  _currentRenderToken?: number;
  lastRenderToken?: number;
  _pendingReadSources?: Set<ReadableSource<unknown>>;
  _pendingReadSourceVersions?: Map<ReadableSource<unknown>, number>;
  _lastReadSources?: Set<ReadableSource<unknown>>;
  devWarningsEmitted?: Set<string>;
  _placeholder?: Comment;
  _ownedChildScopes?: Set<OwnedChildScope>;
  errorBoundaryState?: {
    error: unknown | null;
    resetKey: unknown;
    notified: boolean;
  };
  /** @internal Logical error ancestry for content materialized by a portal host. */
  _portalErrorParent?: ComponentInstance | null;
  /** @internal Ownership identity paired with `_portalErrorParent`. */
  _portalErrorParentGeneration?: object;
}
/**
 * Get the abort signal for the current component.
 *
 * The signal is guaranteed to be aborted when:
 * - Component unmounts
 * - Navigation occurs (different route)
 * - Parent is destroyed
 */
declare function getSignal(): AbortSignal;
interface DerivedSubscriber {
  _markDirty(): void;
  _pendingDependencySources?: Set<ReadableSource<unknown>>;
}
interface ReadableSource<T = unknown> {
  (): T;
  _hasBeenRead?: boolean;
  _hasEverBeenRead?: boolean;
  _unusedStateDiagnosticEligible?: boolean;
  _readers?: Map<
    ComponentInstance,
    {
      token: number;
      generation: object;
    }
  >;
  _derivedSubscribers?: Set<DerivedSubscriber>;
  _version?: number;
}
/**
 * Serialized update scheduler — safer design (no inline execution, explicit flush)
 *
 * Key ideas:
 * - Never execute a task inline from `enqueue`.
 * - `flush()` is explicit and non-reentrant.
 * - `runWithSyncProgress()` allows enqueues temporarily but does not run tasks
 *   inline; it runs `fn` and then does an explicit `flush()`.
 * - `waitForFlush()` is race-free with a monotonic `flushVersion`.
 */
type Task = () => void;
type SchedulerLane = 'derived' | 'component' | 'reactive' | 'post';
type SchedulerBulkCommitProbe = () => boolean;
declare class Scheduler {
  private bulkCommitProbe;
  private lanes;
  private running;
  private inHandler;
  private depth;
  private executionDepth;
  private flushVersion;
  private kickScheduled;
  private allowSyncProgress;
  private waiters;
  private taskCount;
  setBulkCommitProbe(probe: SchedulerBulkCommitProbe): void;
  private isBulkCommitActive;
  private hasPendingTasks;
  private getPendingTaskCount;
  private compactLane;
  private scheduleFlushKick;
  enqueue(task: Task): void;
  enqueueInLane(lane: SchedulerLane, task: Task): void;
  flush(): void;
  runWithSyncProgress<T>(fn: () => T): T;
  waitForFlush(targetVersion?: number, timeoutMs?: number): Promise<void>;
  getState(): {
    queueLength: number;
    running: boolean;
    depth: number;
    executionDepth: number;
    taskCount: number;
    flushVersion: number;
    laneQueues: {
      derived: number;
      component: number;
      reactive: number;
      post: number;
    };
    inHandler: boolean;
    allowSyncProgress: boolean;
  };
  getFlushVersion(): number;
  flushIfQueued(): void;
  runInHandlerScope<T>(fn: () => T, flushMode?: 'defer' | 'sync'): T;
  setInHandler(v: boolean): void;
  isInHandler(): boolean;
  isExecuting(): boolean;
  clearPendingSyncTasks(): number;
  private resolveWaiters;
}
declare function scheduleEventHandler(handler: EventListener): EventListener;
/**
 * Internal DOM range shape shared by runtime ownership records and the
 * renderer. A singleton range uses the node itself for both anchors; a
 * multi-node or empty range uses deterministic comment anchors.
 */
interface DOMRange {
  start: Node;
  end: Node;
  single: boolean;
}
interface ChildScope {
  key: string | number;
  componentInstance: ComponentInstance;
  previousVnode: VNode | undefined;
  vnode: VNode | undefined;
  dom?: Node;
  /** @internal Fast singleton node plus an anchor-backed multi-node range. */
  range?: DOMRange;
  needsDomUpdate: boolean;
  hydrationPending: boolean;
  /** @internal Stable owner for validated intrinsic blueprints in list items. */
  blueprintOwner?: object;
  render(renderFn: () => VNode): VNode;
  markDirty(): void;
  dispose(): void;
}
interface ChildScopeOwnership {
  add(scope: ChildScope): void;
  delete(scope: ChildScope): void;
  bulkDispose(run: () => void): void;
}
/** @internal Snapshot used to restore a child scope after a failed commit. */
interface ChildScopeTransactionSnapshot {
  previousVnode: VNode | undefined;
  vnode: VNode | undefined;
  dom: Node | undefined;
  range: DOMRange | undefined;
  domTextData: string | undefined;
  needsDomUpdate: boolean;
  hydrationPending: boolean;
  renderFn: (() => VNode) | undefined;
  renderedOwnerFrame: ContextFrame | null;
}
/** Diagnostic breakdown of a keyed-list reorder decision, returned by {@link RuntimeRendererHost.isKeyedReorderFastPathEligible}. */
interface RuntimeKeyedReorderDecision {
  useFastPath: boolean;
  totalKeyed: number;
  totalChildren: number;
  currentKeyCount: number;
  moveCount: number;
  lisLen: number;
  hasPropChanges: boolean;
  isWholeKeyedList: boolean;
}
/** The renderer implementation an {@link AskrRuntime} delegates DOM evaluation and cleanup to. */
interface RuntimeRendererHost {
  evaluate(
    node: unknown,
    target: Element | null,
    context?: object,
    retainedOwner?: ComponentInstance
  ): void;
  cleanupInstancesUnder(node: Node): void;
  replaceComponentRange(
    instance: ComponentInstance,
    result: unknown,
    host: Element | Comment
  ): Node | null;
  resolveChildScopeRange?(scope: ChildScope): DOMRange | null;
  teardownNodeSubtree(root: Node): void;
  populateKeyMapForElement(parent: Element): void;
  getKeyMapForElement(
    parent: Element
  ): Map<string | number, Element> | undefined;
  isKeyedReorderFastPathEligible(
    parent: Element,
    children: unknown[],
    oldKeyMap: Map<string | number, Element> | undefined
  ): RuntimeKeyedReorderDecision;
  markReactivePropsDirtySource(source: ReadableSource<unknown>): void;
}
/** Options for {@link createRuntime}. */
interface AskrRuntimeOptions {
  scheduler?: Scheduler;
  renderer?: RuntimeRendererHost;
}
/** A scheduler + renderer host pairing; owns scheduling and renderer wiring for an app instance. */
declare class AskrRuntime {
  readonly scheduler: Scheduler;
  private rendererHost;
  constructor(options?: AskrRuntimeOptions);
  get renderer(): RuntimeRendererHost;
  configureRenderer(renderer: RuntimeRendererHost): void;
}
/** Create a new {@link AskrRuntime} instance with its own scheduler/renderer wiring. */
declare function createRuntime(options?: AskrRuntimeOptions): AskrRuntime;
/** Get the process-wide default {@link AskrRuntime}. */
declare function getDefaultRuntime(): AskrRuntime;
type ForItemSignal<T> = ReadableSource<T> &
  (() => T) & {
    peek(): T;
    set(newValue: T, notifyReaders?: boolean): void;
  };
type ForItemPropertySignal = ReadableSource<unknown> &
  (() => unknown) & {
    peek(): unknown;
    set(newValue: unknown, notifyReaders?: boolean): void;
  };
type ForIndexSignal = ReadableSource<number> &
  (() => number) & {
    peek(): number;
    set(
      newValue: number | ((prev: number) => number),
      notifyReaders?: boolean
    ): void;
  };
interface ReactiveForItemState<T> {
  currentItem: T;
  itemSignal: ForItemSignal<T> | null;
  propertySignals: Map<PropertyKey, ForItemPropertySignal> | null;
  coalescedProperties: PropertyKey | PropertyKey[] | null;
  coalescedProperty2: PropertyKey | null;
  wholeItemRead: boolean;
  proxy: T;
}
interface ForItemInstance<T> {
  key: string | number;
  item: T;
  reactiveItem: T;
  reactiveItemState: ReactiveForItemState<T> | null;
  indexSignal: ForIndexSignal;
  scope: ChildScope;
}
interface FineGrainedEffectHandle<T> {
  cleanup(): void;
  updateCompute(nextCompute: () => T): void;
  flush(): void;
}
type ForEachSource<T> = readonly T[] | (() => readonly T[]);
type ForKeySelector<T> = (item: T, index: number) => string | number;
type ForRenderItem<T> = (item: T, index: () => number) => VNode;
type ForCommitStrategy =
  | 'APPEND'
  | 'INSERT_ONE'
  | 'REMOVE_ONE'
  | 'TRUNCATE'
  | 'NO_REORDER'
  | 'SWAP'
  | 'FULL_KEYED';
interface ForState<T> {
  kind: 'for';
  _contextFrame: ContextFrame | null;
  _contextFrameChanged: boolean;
  currentItems: readonly T[];
  _committedItems: readonly T[];
  eachSource: ForEachSource<T>;
  fallback: VNode | null;
  fallbackScope: ChildScope | null;
  items: Map<string | number, ForItemInstance<T>>;
  orderedKeys: Array<string | number>;
  orderedItems: ForItemInstance<T>[];
  orderedVNodes: VNode[];
  byFn: ForKeySelector<T>;
  renderFn: ForRenderItem<T>;
  parentInstance: ComponentInstance | null;
  lastCommitStrategy: ForCommitStrategy;
  lastRemovedNodes: Node[];
  lastRemovedRanges: DOMRange[];
  pendingDirtyIndices: number[] | null;
  pendingSwapIndices: [number, number] | null;
  pendingMoveOnly: boolean;
  pendingInsertedIndex: number | null;
  pendingRemovedKey: string | number | null;
  pendingAppendStart: number | null;
  _hasResolvedItemDom: boolean;
  _needsSourceReconcile: boolean;
  _sourceEffect: FineGrainedEffectHandle<readonly T[]> | null;
  _suspendSourceCommit: boolean;
  _enqueueBoundaryCommit?: (() => void) | null;
  _hasPendingBoundaryCommit?: boolean;
  devKeyKinds?: Map<string | number, 'number' | 'string'>;
  _transaction?: ForTransaction<T> | null;
  _scopeOwnership: ChildScopeOwnership;
}
interface ForItemTransactionSnapshot<T> {
  item: T;
  itemSignalExists: boolean;
  itemSignalValue: T | undefined;
  itemSignalHasBeenRead: boolean;
  indexValue: number;
  indexHasBeenRead: boolean;
  propertySignalStore: Map<PropertyKey, ForItemPropertySignal> | null;
  propertySignals: Map<
    PropertyKey,
    {
      signal: ForItemPropertySignal;
      value: unknown;
      hasBeenRead: boolean;
    }
  > | null;
  scope: ChildScopeTransactionSnapshot;
}
interface ForTransaction<T> {
  collectionSnapshotMode: 'copy' | 'reset-empty' | 'preserve-clear' | 'reuse';
  currentItems: readonly T[];
  items: Map<string | number, ForItemInstance<T>>;
  orderedKeys: Array<string | number>;
  orderedItems: ForItemInstance<T>[];
  orderedVNodes: VNode[];
  fallbackScope: ChildScope | null;
  lastCommitStrategy: ForCommitStrategy;
  lastRemovedNodes: Node[];
  lastRemovedRanges: DOMRange[];
  pendingDirtyIndices: number[] | null;
  pendingSwapIndices: [number, number] | null;
  pendingMoveOnly: boolean;
  pendingInsertedIndex: number | null;
  pendingRemovedKey: string | number | null;
  pendingAppendStart: number | null;
  hasResolvedItemDom: boolean;
  needsSourceReconcile: boolean;
  devKeyKinds?: Map<string | number, 'number' | 'string'>;
  itemSnapshots: Map<ForItemInstance<T>, ForItemTransactionSnapshot<T>> | null;
  unreadIndexSnapshots: Map<ForIndexSignal, number> | null;
  fallbackScopeSnapshot: ChildScopeTransactionSnapshot | null;
  removedScopes: ChildScope[] | null;
  removedScopeNodes: Node[] | null;
  removeAllItems: boolean;
  signalEffects: Map<
    ReadableSource<unknown>,
    {
      parentInstance: ComponentInstance | null;
      notify: boolean;
      skipInstance: ComponentInstance | null;
      skipOwnedBy: ComponentInstance | null;
    }
  > | null;
  shouldClearDomUpdateState: boolean;
}
interface MatchBranch {
  key: string | number;
  render: () => VNode;
  when: unknown;
}
interface BranchControlStateBase {
  _contextFrame: ContextFrame | null;
  activeKey: string | number | null;
  activeScope: ChildScope | null;
  activeVNodes: VNode[];
  lastRemovedNodes: Node[];
  lastRemovedRanges: DOMRange[];
  parentInstance: ComponentInstance | null;
  _enqueueBoundaryCommit?: (() => void) | null;
  _hasPendingBoundaryCommit?: boolean;
  _transaction?: ControlTransaction | null;
}
interface ShowState extends BranchControlStateBase {
  kind: 'show';
  fallbackScope: ChildScope | null;
  renderFallback: (() => VNode) | null;
  renderTruthy: ((value: unknown) => VNode) | (() => VNode);
  selectedValue: unknown;
  truthyScope: ChildScope | null;
}
interface CaseState extends BranchControlStateBase {
  kind: 'case';
  fallback: (() => VNode) | null;
  matches: MatchBranch[];
}
type ControlBoundaryState = ForState<unknown> | ShowState | CaseState;
type BranchStateSnapshot = {
  activeKey: string | number | null;
  activeScope: ChildScope | null;
  activeVNodes: VNode[];
  lastRemovedNodes: Node[];
  lastRemovedRanges: DOMRange[];
  scopeSnapshots: Map<ChildScope, ChildScopeTransactionSnapshot>;
  fallbackScope?: ChildScope | null;
  truthyScope?: ChildScope | null;
};
interface ControlTransaction {
  state: ShowState | CaseState;
  snapshot: BranchStateSnapshot;
  removedScopes: ChildScope[];
  shouldClearDomUpdateState: boolean;
  registered: boolean;
}
declare const SNAPSHOT_SOURCE_BRAND: unique symbol;
type SnapshotSourceBrand = {
  readonly [SNAPSHOT_SOURCE_BRAND]: true;
};
/** A reactive derived value produced by {@link derive}; call it to read the current result. */
interface Derived<T> extends ReadableSource<T> {
  (): T;
}
type SnapshotSource<T> = {
  value: T | null;
  pending?: boolean;
  error?: Error | null;
} & SnapshotSourceBrand;
/** Creates a render-scoped derived value; must be called during component render. */
declare function derive<TOut>(fn: () => TOut): Derived<TOut>;
declare function derive<TIn, TOut>(
  source: SnapshotSource<TIn> | TIn | (() => TIn),
  map: (value: TIn) => TOut
): Derived<TOut | null>;
/** A gating condition for lifecycle primitives like {@link timer}; `true` means active. */
type ActivityPredicate = () => boolean;
/** Options for {@link timer}. */
interface TimerOptions {
  when?: ActivityPredicate | readonly ActivityPredicate[];
}
/** {@link ActivityPredicate} that is true while the current route matches `pathOrPaths`. */
declare function routeActive(
  pathOrPaths: string | readonly string[]
): ActivityPredicate;
/** {@link ActivityPredicate} that is true while the document is visible. */
declare function documentVisible(): ActivityPredicate;
/** {@link ActivityPredicate} that is true while the window has focus. */
declare function windowFocused(): ActivityPredicate;
/** An event target, or a function resolving one, accepted by {@link on}. */
type ListenerTarget = EventTarget | (() => EventTarget | null | undefined);
type ListenerOptions = boolean | AddEventListenerOptions | undefined;
/** Attach an owned event listener to `target` for the current component's lifetime. */
declare function on(
  target: ListenerTarget,
  event: string,
  handler: EventListener,
  options?: ListenerOptions
): void;
/** Run `fn` on an owned interval for the current component's lifetime, optionally gated by `options.when`. */
declare function timer(
  intervalMs: number,
  fn: () => void,
  options?: TimerOptions
): void;
/** Runs an owned task after commit. */
declare function task(
  fn: () => void | (() => void) | PromiseLike<void | (() => void)>
): void;
/** A callable reactive source accepted by {@link watch}. */
type WatchSource<T> = ReadableSource<T>;
/** Values inferred from an ordered tuple of {@link WatchSource} accessors. */
type WatchValues<TSources extends readonly WatchSource<unknown>[]> = {
  -readonly [TIndex in keyof TSources]: ReturnType<TSources[TIndex]>;
};
/** Post-commit generation details supplied to a {@link watch} callback. */
interface WatchContext<TValue> {
  readonly initial: boolean;
  readonly previous: TValue | undefined;
  readonly signal: AbortSignal;
}
/** Owned side-effect callback invoked by {@link watch}. */
type WatchCallback<TValue> = (
  value: TValue,
  context: WatchContext<TValue>
) => void | (() => void) | PromiseLike<void>;
/** Observe one readable source after commit and whenever its value changes. */
declare function watch<TValue>(
  source: WatchSource<TValue>,
  callback: WatchCallback<TValue>
): void;
/** Observe an ordered tuple of readable sources after commit and whenever an entry changes. */
declare function watch<const TSources extends readonly WatchSource<unknown>[]>(
  sources: TSources,
  callback: WatchCallback<WatchValues<TSources>>
): void;
/**
 * Capture the result of a synchronous expression at call time and return a
 * thunk that returns the captured value later. This is a low-level helper for
 * cases where async continuations need to observe a snapshot of values at the
 * moment scheduling occurred.
 *
 * Usage (public API):
 * const snapshot = capture(() => someState());
 * Promise.resolve().then(() => { use(snapshot()); });
 */
declare function capture<T>(fn: () => T): () => T;
interface RenderDiagnosticsOptions {
  /** Emit one warning per component instance when a render exceeds the threshold. */
  slowRenderWarnings?: boolean;
  /** Slow-render threshold in milliseconds. The default is 5. */
  slowRenderThresholdMs?: number;
}
/**
 * Configure development render diagnostics and return a function that restores
 * the previous configuration. Component counters and timing remain enabled
 * when warning output is disabled.
 */
declare function configureRenderDiagnostics(
  options: RenderDiagnosticsOptions
): () => void;
/** A fine-grained reactive membership check produced by {@link selector}. */
interface Selector<T> {
  (candidate: T): boolean;
}
type SelectorEquals<T> = {
  bivarianceHack(a: T, b: T): boolean;
}['bivarianceHack'];
/**
 * Creates a render-scoped predicate for keyed membership in reactive list rows.
 *
 * Use this when a `<For>` child needs to compare each stable item with a
 * changing selected value. Unlike a plain closure capture, the predicate
 * subscribes the affected rows and updates them without rebuilding the list.
 * Must be called during component render.
 */
declare function selector<T>(
  source: () => T,
  equals?: SelectorEquals<T>
): Selector<T>;
type BoundaryChild = RenderableChild;
type ForBaseProps<T> = {
  each: ForEachSource<T>;
  fallback?: BoundaryChild;
  /**
   * Row renderer. Parent reactive reads must use `selector()` or thunk props;
   * closure-captured values are snapshotted when the row is created or
   * reconciled; changing the parent source does not rerun an existing row.
   */
  children: (item: T, index: () => number) => VNode;
};
type KeyedForProps<T, K extends string | number> = ForBaseProps<T> & {
  by: (item: T, index: number) => K;
  byIndex?: never;
};
type IndexedForProps<T> = ForBaseProps<T> & {
  by?: never;
  byIndex: true;
};
/** Props for {@link For}. */
type ForProps<T, K extends string | number = string | number> =
  | KeyedForProps<T, K>
  | IndexedForProps<T>;
/** Render a keyed or indexed list, reconciling items by key instead of position. */
declare const For: <T, K extends string | number = string | number>(
  props: ForProps<T, K>
) => JSXElement;
type ShowSource<T> = T | (() => T);
type Truthy<T> = T extends false | '' | 0 | 0n | null | undefined ? never : T;
/** Props for {@link Show}. */
type ShowProps<T> = {
  when: ShowSource<T>;
  fallback?: BoundaryChild;
  children: BoundaryChild | ((value: Truthy<T>) => BoundaryChild);
};
/** Conditionally render children based on `when`, narrowing truthy values for the render function form. */
declare const Show: <T>(props: ShowProps<T>) => JSXElement;
type MatchChild = BoundaryChild | (() => BoundaryChild);
/** Props for {@link Match}, valid only as a direct child of {@link Case}. */
type MatchProps = {
  key?: string | number | null;
  when: unknown;
  children: MatchChild;
};
/** Props for {@link Case}. */
type CaseProps = {
  fallback?: BoundaryChild;
  children?: unknown;
};
/** Declares one branch of a {@link Case}; only valid as its direct child. */
declare function Match(_props: MatchProps): null;
/** Render the first matching {@link Match} child (by `when`), or `fallback` if none match. */
declare const Case: (props: CaseProps) => JSXElement;
/** Lexical scope carrying the CSP nonce for the current render, if any. */
declare const CspNonceScope: Scope<string | undefined>;
/**
 * Read the CSP nonce for the current render from {@link CspNonceScope}.
 *
 * @returns The active nonce, or `undefined` when called outside of a
 * component render or when no nonce was configured.
 */
declare function cspNonce(): string | undefined;
interface DeferredBoundaryRegistration {
  id: string;
  promise: Promise<unknown>;
  fulfilled(value: unknown): RenderableChild;
  rejected(error: unknown): RenderableChild;
}
interface SSRPortalHostRegistration {
  token: string;
  automatic: boolean;
}
interface SSRPortalSlot {
  hasValue: boolean;
  value: RenderableChild | undefined;
  hosts: SSRPortalHostRegistration[];
}
interface SSRPortalState {
  slots: Map<object, SSRPortalSlot>;
  nextHostId: number;
}
/** Register request-local CSS produced during SSR without importing the SSR renderer in clients. */
declare function registerSSRStyle(id: string, cssText: string): void;
/**
 * Creates a stable holder for an intrinsic element ref.
 *
 * The renderer mutates `current` during commit and clears it during cleanup.
 * Updating the holder never schedules a render.
 */
interface Ref<T extends Element = Element> {
  current: T | null;
}
/** Create a new, empty {@link Ref} holder. */
declare function createRef<T extends Element = Element>(): Ref<T>;
/**
 * Create a reactive {@link Mutation} cell bound to the current component,
 * running `options.action` on `execute()` and optionally invalidating
 * affected query prefixes on success.
 */
declare function createMutation<TInput, TResult>(
  options: MutationOptions<TInput, TResult>
): Mutation<TInput, TResult>;
/**
 * Create a reactive {@link Query} cell bound to the current component, either
 * from inline `options` (key + fetch) or a reusable {@link QueryDefinition}
 * plus its input.
 */
declare function createQuery<T extends {}>(options: QueryOptions<T>): Query<T>;
declare function createQuery<TInput, TResult extends {}>(
  definition: QueryDefinition<TInput, TResult>,
  input: TInput,
  options?: Omit<QueryOptions<TResult>, 'key' | 'fetch'>
): Query<TResult>;
/** Create a new, isolated {@link DataRuntime} with its own query/mutation caches. */
declare function createDataRuntime(options?: DataRuntimeOptions): DataRuntime;
/** Get the process-wide default {@link DataRuntime} used when none is provided explicitly. */
declare function getDefaultDataRuntime(): DataRuntime;
/** Mark all cached queries whose key starts with `prefix` as stale, triggering a refresh. */
declare function invalidate(prefix: string, options?: InvalidateOptions): void;
/** Create a {@link QueryScope} that namespaces keys and invalidations under `namespace`. */
declare function queryScope(namespace: string): QueryScope;
/**
 * Periodically invalidate queries matching `prefix` on a fixed interval,
 * optionally gated by active route, document visibility, or window focus.
 */
declare function invalidateOnInterval(
  prefix: string,
  options: InvalidateOnIntervalOptions
): void;
/**
 * Create one lifecycle-owned collection of dynamically keyed readers for a
 * reusable query definition, with bounded collection-started fetches.
 */
declare function createQueryCollection<
  TInput,
  TResult extends {},
  TKey extends QueryCollectionKey = string,
>(
  options: QueryCollectionOptions<TInput, TResult, TKey>
): QueryCollection<TInput, TResult, TKey>;
/** Lookup table of server handlers keyed by their {@link QueryDefinition}, built by {@link defineServerQueries}. */
interface ServerQueryRegistry {
  readonly entries: readonly ServerQueryEntry<unknown, {}>[];
  get<TInput, TResult extends {}>(
    query: QueryDefinition<TInput, TResult>
  ): ServerQueryHandler<TInput, TResult> | undefined;
}
/** A query paired with the server handler that resolves it, produced by {@link serveQuery}. */
interface ServerQueryEntry<TInput, TResult extends {}> {
  readonly query: QueryDefinition<TInput, TResult>;
  readonly handler: ServerQueryHandler<TInput, TResult>;
}
/** Pair a {@link QueryDefinition} with the server-side handler that resolves it. */
declare function serveQuery<TInput, TResult extends {}>(
  query: QueryDefinition<TInput, TResult>,
  handler: ServerQueryHandler<TInput, TResult>
): ServerQueryEntry<TInput, TResult>;
/** Build a {@link ServerQueryRegistry} from one or more {@link serveQuery} entries. */
declare function defineServerQueries(
  ...entries: readonly ServerQueryEntry<any, any>[]
): ServerQueryRegistry;
/** Freeze and return a reusable {@link QueryDefinition}. */
declare function defineQuery<TInput, TResult extends {}>(
  definition: QueryDefinition<TInput, TResult>
): QueryDefinition<TInput, TResult>;
/**
 * Create a {@link QueryPrefetchContext} for prefetching query data ahead of
 * render, e.g. during SSR route resolution.
 */
declare function createQueryPrefetchContext(options?: {
  runtime?: DataRuntime;
  registry?: ServerQueryRegistry;
  request?: Request;
  signal?: AbortSignal;
  mode?: 'ssr' | 'spa';
  telemetry?: CoreTelemetry;
}): QueryPrefetchContext;
/** Prefetch `query` with `input` into a {@link QueryPrefetchContext}'s runtime. */
declare function prefetchQuery<TInput, TResult extends {}>(
  context: QueryPrefetchContext,
  query: QueryDefinition<TInput, TResult>,
  input: TInput
): Promise<boolean>;
/** Extract a runtime's cached query data into a JSON-serializable snapshot, dropping non-serializable values. */
declare function dehydrateDataRuntime(
  runtime: DataRuntime
): Record<string, unknown>;
/** Load a {@link dehydrateDataRuntime} snapshot back into a runtime's query cache. */
declare function hydrateDataRuntime(runtime: DataRuntime, data: unknown): void;
/** A declared server action, built by {@link defineAction}, bound to a form via {@link ActionForm}. */
interface ActionDescriptor<
  TInput extends Record<string, unknown> = Record<string, unknown>,
> {
  readonly id: string;
  readonly input: ObjectSchema<TInput>;
  readonly invalidates: readonly string[];
}
/** Declare a server action with a stable id, input schema, and query prefixes to invalidate on success. */
declare function defineAction<TInput extends Record<string, unknown>>(options: {
  readonly id: string;
  readonly input: ObjectSchema<TInput>;
  readonly invalidates?: readonly string[];
}): ActionDescriptor<TInput>;
/** A native form bound to a declared action; it is not a synthetic event API. */
declare function ActionForm<TInput extends Record<string, unknown>>({
  action,
  children,
  ...props
}: {
  readonly action: ActionDescriptor<TInput>;
  readonly children?: RenderableChild;
  readonly [key: string]: unknown;
}): JSXElement;
/** Server-replayed validation failure for an {@link ActionForm} submission. */
interface ActionValidationError {
  readonly kind: 'invalid';
  readonly action: string;
  readonly values: Readonly<Record<string, unknown>>;
  readonly issues: readonly unknown[];
  readonly fieldErrors: Readonly<Record<string, readonly string[]>>;
}
/** Pending/result/error status for an action, as reported by the `action()` hook. */
interface ActionStatus<TResult = unknown> {
  readonly pending: boolean;
  readonly result?: TResult;
  readonly error?: unknown;
}
/** Returns a command handle, rather than a hook. */
declare function action<
  TInput extends Record<string, unknown>,
  TResult = unknown,
>(
  descriptor: ActionDescriptor<TInput>
): {
  state: StateTuple<ActionStatus<TResult>>;
  submit(input: TInput): Promise<TResult>;
};
export {
  routeActive,
  RouteSnapshot,
  cspNonce,
  SSRStyleRegistrationValidation,
  RouteDefinition,
  selector,
  RoutePathParams,
  createMutation,
  RenderableChild,
  PageScopeRecord,
  SSRPortalState,
  DocumentRenderer,
  RouteAuthResolver,
  DeferredBoundaryRegistration,
  DocumentRenderContext,
  RouteAuthOptions,
  Show,
  RouteMeta,
  TimerOptions,
  RouteRefSearch,
  configureRenderDiagnostics,
  RouteQuery,
  ShowProps,
  RouteMetaSource,
  WatchSource,
  RouteRenderResult,
  WatchCallback,
  RouteRegistry,
  For,
  RouteMode,
  CaseProps,
  StateSetter,
  RouteHandler,
  Match,
  StateTuple,
  RouteManifest,
  registerSSRStyle,
  SSRData,
  RouteComponent,
  MatchProps,
  state,
  RouteMatch,
  on,
  RouteSearchValue,
  ForProps,
  RouteOptions,
  createQuery,
  ComponentFunction,
  PageHelperOptions,
  createRef,
  DocumentRenderArgs,
  Route,
  ActivityPredicate,
  RouteRecord,
  RenderDiagnosticsOptions,
  RoutePolicy,
  ListenerTarget,
  RouteRef,
  capture,
  RouteRequestResult,
  WatchValues,
  RouteRequestOptions,
  documentVisible,
  RouteSearch,
  invalidate,
  QueryStaleReason,
  AccessDenyStatus,
  action,
  Mutation,
  derive,
  createDataRuntime,
  defineScope,
  GroupHelperOptions,
  ServerQueryRegistry,
  QueryCollection,
  RuntimeKeyedReorderDecision,
  defineServerQueries,
  QueryCollectionOptions,
  getDefaultRuntime,
  CoreTelemetry,
  task,
  dehydrateDataRuntime,
  QueryConsistency,
  scheduleEventHandler,
  createQueryCollection,
  QueryScope,
  AccessDenyDecision,
  serveQuery,
  QueryPrefetchContext,
  AccessDecision,
  ActionValidationError,
  InvalidateOptions,
  Derived,
  Case,
  State,
  RouteDestination,
  CspNonceScope,
  SSRStyleRegistration,
  RouteContext,
  createQueryPrefetchContext,
  QueryCollectionEntry,
  RuntimeRendererHost,
  prefetchQuery,
  QueryKeyPart,
  AccessAllowDecision,
  ActionForm,
  DataRuntimeOptions,
  watch,
  defineAction,
  MutationOptions,
  AskrRuntime,
  hydrateDataRuntime,
  QueryDefinition,
  getSignal,
  WatchContext,
  RouteRegistryOptions,
  ActionStatus,
  InvalidateOnIntervalOptions,
  windowFocused,
  ServerQueryEntry,
  Query,
  AskrRuntimeOptions,
  ActionDescriptor,
  DataRuntime,
  timer,
  defineQuery,
  QueryCollectionKey,
  createRuntime,
  invalidateOnInterval,
  ServerQueryHandler,
  AccessRedirectDecision,
  Ref,
  VNode,
  ParsedSegment,
  getDefaultDataRuntime,
  readScope,
  LayoutScopeRecord,
  queryScope,
  Scope,
  AccessRedirectStatus,
  Selector,
  RouteParams,
};
