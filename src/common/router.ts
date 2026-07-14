import type { RenderableChild } from './vnode';
import type { QueryPrefetchContext } from '../data/types';
import type { AuthContext, AuthRequirement } from '@askrjs/auth';

/**
 * Common call contracts: Router types
 */

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

export type RouteMode = 'spa' | 'ssr' | 'ssg';
export type AccessRedirectStatus = 301 | 302 | 303 | 307 | 308;
export type AccessDenyStatus = 401 | 403 | 404;

export interface AccessAllowDecision {
  kind: 'allow';
}

export interface AccessRedirectDecision {
  kind: 'redirect';
  to: string;
  status?: AccessRedirectStatus;
  replace?: boolean;
}

export interface AccessDenyDecision {
  kind: 'deny';
  status: AccessDenyStatus;
}

export type AccessDecision =
  | AccessAllowDecision
  | AccessRedirectDecision
  | AccessDenyDecision;

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

export type RoutePolicy = (
  context: RouteContext
) => AccessDecision | PromiseLike<AccessDecision>;

export type RouteAuthResolver = (
  context: Omit<RouteContext, 'auth'>
) => AuthContext | PromiseLike<AuthContext>;

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
> extends CommonAccessOptions {
  loader?: (context: RouteContext<TParams> & { request?: Request }) => unknown;
  preload?: (context: RouteContext<TParams> & { request?: Request; data: QueryPrefetchContext }) => unknown;
  entries?: () => Array<TParams> | Promise<Array<TParams>>;
  title?: string;
  namespace?: string;
}

export interface PageHelperOptions extends CommonAccessOptions {
  preload?: (context: RouteContext & { request?: Request; data: QueryPrefetchContext }) => unknown;
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

export interface RegisterRoutesOptions {
  auth?: RouteAuthOptions;
}

export type RouteDefinition = () => void;

export interface RouteRequestOptions {
  manifest?: RouteManifest;
  mode?: RouteMode;
  auth?: RouteAuthOptions;
  authContext?: AuthContext;
  signal?: AbortSignal;
  request?: Request;
}

export interface RouteRenderResult<TParams extends RouteParams = RouteParams> {
  kind: 'render';
  handler: RouteHandler<TParams>;
  params: TParams;
}

export type RouteRequestResult<TParams extends RouteParams = RouteParams> =
  | RouteRenderResult<TParams>
  | AccessRedirectDecision
  | AccessDenyDecision
  | null;

export interface GroupHelperOptions extends CommonAccessOptions {
  layout?: (props: { children?: RenderableChild }) => RenderableChild;
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
 * import { getManifest } from '@askrjs/askr/router';
 * await createSPA({ root: '#app', manifest: getManifest() });
 * ```
 */
export interface RouteManifest {
  records: RouteRecord[];
  auth?: RouteAuthOptions;
}

export interface RouteHandler<TParams extends RouteParams = RouteParams> {
  (params: TParams, context?: { signal: AbortSignal }): RenderableChild;
}

export interface Route<TParams extends RouteParams = RouteParams> {
  path: string;
  handler: RouteHandler<TParams>;
  namespace?: string;
}

export interface RouteRegistry {
  manifest: RouteManifest;
  routes: readonly Route[];
}

export interface ResolvedRoute<TParams extends RouteParams = RouteParams> {
  handler: RouteHandler<TParams>;
  params: TParams;
}

export interface RouteMatch<TParams extends RouteParams = RouteParams> {
  path: string;
  params: Readonly<TParams>;
  name?: string;
  namespace?: string;
}

export interface RouteQuery {
  get(key: string): string | null;
  getAll(key: string): string[];
  has(key: string): boolean;
  toJSON(): Record<string, string | string[]>;
}

export interface RouteSnapshot<TParams extends RouteParams = RouteParams> {
  path: string;
  params: Readonly<TParams>;
  query: Readonly<RouteQuery>;
  hash: string | null;

  name?: string;
  namespace?: string;
  matches: readonly RouteMatch<TParams>[];
}
