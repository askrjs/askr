import type { RenderableChild } from './vnode';
import type { QueryPrefetchContext } from '../data/types';
import type { AuthContext, AuthRequirement } from '@askrjs/auth';
import type { InferSchema, ObjectSchema } from '@askrjs/schema';
import type { ActionDescriptor } from '../actions';
import type { CoreTelemetry } from './telemetry';

/**
 * Common call contracts: Router types
 */

/** Path parameters captured for a matched route, keyed by parameter name. */
export type RouteParams = Record<string, string>;

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
export type RoutePathParams<Path extends string> = [
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
export type RouteComponent<TParams extends RouteParams = RouteParams> = (
  props: TParams
) => RenderableChild;

/** The rendering mode a route is currently being evaluated under. */
export type RouteMode = 'spa' | 'ssr' | 'ssg';
export type AccessRedirectStatus = 301 | 302 | 303 | 307 | 308;
export type AccessDenyStatus = 401 | 403 | 404;

export interface AccessAllowDecision {
  kind: 'allow';
}

/** Policy decision produced by {@link redirect}: sends the visitor to another URL. */
export interface AccessRedirectDecision {
  kind: 'redirect';
  to: string;
  status?: AccessRedirectStatus;
  replace?: boolean;
}

/** Policy decision produced by {@link deny}/{@link unauthorized}/{@link forbidden}/{@link notFound}. */
export interface AccessDenyDecision {
  kind: 'deny';
  status: AccessDenyStatus;
}

/** Outcome of a {@link RoutePolicy} evaluation: allow, redirect, or deny. */
export type AccessDecision =
  | AccessAllowDecision
  | AccessRedirectDecision
  | AccessDenyDecision;

/** Context passed to route policies, auth resolvers, and loaders. */
export interface RouteContext<TParams extends RouteParams = RouteParams> {
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
export type RoutePolicy = (
  context: RouteContext
) => AccessDecision | PromiseLike<AccessDecision>;

/** Resolves the {@link AuthContext} for a route request. */
export type RouteAuthResolver = (
  context: Omit<RouteContext, 'auth'>
) => AuthContext | PromiseLike<AuthContext>;

/** Auth configuration shared across a route registry or a single route. */
export interface RouteAuthOptions {
  resolve: RouteAuthResolver;
  loginPath?:
    | string
    | ((context: RouteContext) => string | PromiseLike<string>);
  authenticatedRedirectTo?:
    | string
    | ((context: RouteContext) => string | PromiseLike<string>);
}

export interface CommonAccessOptions {
  auth?: AuthRequirement;
  policies?: readonly RoutePolicy[];
}

/** A route's metadata, or a function computing it from the resolved context. */
export type RouteMetaSource<TParams extends RouteParams = RouteParams> =
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
export interface RouteOptions<
  TParams extends RouteParams = RouteParams,
  TSearchSchema extends ObjectSchema<RouteSearch> | undefined =
    | ObjectSchema<RouteSearch>
    | undefined,
  TLoaderData = unknown,
  TDehydratedData = TLoaderData,
> extends CommonAccessOptions {
  loader?: (
    context: RouteContext<TParams> & { request?: Request }
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
    context: RouteContext<TParams> & { request?: Request }
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

export interface RouteMeta {
  title?: string;
  description?: string;
  canonical?: string;
  robots?: string;
  openGraph?: Record<string, string>;
  links?: readonly { rel: string; href: string; [key: string]: string }[];
  jsonLd?: unknown | readonly unknown[];
  html?: { lang?: string; dir?: 'ltr' | 'rtl' | 'auto' };
}

/** A stable, typed reference returned by route() for destination construction. */
export type RouteSearchValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | readonly (string | number | boolean | null)[];

/** A route's query-string parameters, keyed by name. */
export type RouteSearch = Record<string, RouteSearchValue>;

/** Stable, typed reference to a route returned by `route()`, used to build destinations. */
export interface RouteRef<
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

export type RouteRefSearch<
  TSchema extends ObjectSchema<RouteSearch> | undefined,
> =
  TSchema extends ObjectSchema<RouteSearch>
    ? InferSchema<TSchema>
    : RouteSearch;

/** A resolved navigation target with a computed `href`, produced by {@link to}. */
export interface RouteDestination {
  readonly href: string;
}

/** Options accepted by the `page()` route-declaration helper. */
export interface PageHelperOptions extends CommonAccessOptions {
  preload?: (
    context: RouteContext & { request?: Request; data: QueryPrefetchContext }
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
export interface ParsedSegment {
  kind: 'static' | 'param' | 'wildcard' | 'splat' | 'catchall';
  /** For static/wildcard/catchall: the literal text; for param: the param name. */
  value: string;
}

/** Resolved layout component as stored in a route record's layout chain. */
export interface LayoutScopeRecord {
  component: (props: { children?: RenderableChild }) => RenderableChild;
}

/** Resolved page host component as stored in a route record's page chain. */
export interface PageScopeRecord {
  component: RouteComponent;
}

/** Options for {@link createRouteRegistry}. */
export interface RouteRegistryOptions {
  auth?: RouteAuthOptions;
  /** Public pathname prefix for applications mounted below the origin root. */
  basePath?: string;
}

/** A callback that declares routes via `route()`/`page()`/`group()`, passed to {@link createRouteRegistry}. */
export type RouteDefinition = () => void;

/** Options for resolving a route request (used internally by `createSPA`/`hydrateSPA`/SSR). */
export interface RouteRequestOptions {
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
export interface RouteRenderResult<TParams extends RouteParams = RouteParams> {
  kind: 'render';
  handler: RouteHandler<TParams>;
  params: TParams;
  record?: RouteRecord;
}

/** Outcome of resolving a route request: render, redirect, deny, or no match. */
export type RouteRequestResult<TParams extends RouteParams = RouteParams> =
  | RouteRenderResult<TParams>
  | AccessRedirectDecision
  | AccessDenyDecision
  | null;

/** Options accepted by the `group()` route-declaration helper. */
export interface GroupHelperOptions extends CommonAccessOptions {
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
export interface RouteRecord {
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
export interface RouteManifest {
  records: RouteRecord[];
  auth?: RouteAuthOptions;
  /** Normalized public pathname prefix. Empty and root mounts omit it. */
  basePath?: string;
}

declare const routeRegistryBrand: unique symbol;

/** A function rendering a matched route's page content, with layouts already composed. */
export interface RouteHandler<TParams extends RouteParams = RouteParams> {
  (params: TParams, context?: { signal: AbortSignal }): RenderableChild;
}

/** A single path-to-handler binding as seen by low-level navigation code. */
export interface Route<TParams extends RouteParams = RouteParams> {
  path: string;
  handler: RouteHandler<TParams>;
  namespace?: string;
}

/** Opaque handle produced by {@link createRouteRegistry}, required by `createSPA`/`hydrateSPA`. */
export interface RouteRegistry {
  /** Internal brand: registries must come from createRouteRegistry(). */
  readonly [routeRegistryBrand]: true;
  manifest: RouteManifest;
  routes: readonly Route[];
}

export interface ResolvedRoute<TParams extends RouteParams = RouteParams> {
  handler: RouteHandler<TParams>;
  params: TParams;
}

/** A single matched route, as reported by {@link currentRoute} and activity predicates. */
export interface RouteMatch<TParams extends RouteParams = RouteParams> {
  path: string;
  params: Readonly<TParams>;
  name?: string;
  namespace?: string;
}

/** Read-only accessor for the current route's query-string parameters. */
export interface RouteQuery {
  get(key: string): string | null;
  getAll(key: string): string[];
  has(key: string): boolean;
  toJSON(): Record<string, string | string[]>;
}

/** Full description of the currently active route, returned by {@link currentRoute}. */
export interface RouteSnapshot<
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
