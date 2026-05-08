/**
 * Common call contracts: Router types
 */

/**
 * A route page component: a regular component that receives route params as
 * props (always `Record<string, string>` derived from the URL pattern).
 *
 * Components may accept no params at all — `() => unknown` is assignable.
 */
export type RouteComponent = (props: Record<string, string>) => unknown;

export type RouteMode = 'spa' | 'ssr' | 'ssg';
export type RouteAuthMode = true | 'guest';
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

export interface RouteContext<Session = unknown, User = unknown> {
  mode: RouteMode;
  params: Record<string, string>;
  pathname: string;
  search: string;
  hash: string;
  href: string;
  session: Session | null;
  user: User | null;
  signal: AbortSignal;
}

export type RoutePolicy = (
  context: RouteContext
) => AccessDecision | Promise<AccessDecision>;

export interface RouteAuthState<Session = unknown, User = unknown> {
  session: Session | null;
  user: User | null;
}

export type RouteAuthResolver<Session = unknown, User = unknown> = (
  context: Omit<RouteContext<Session, User>, 'session' | 'user'>
) => RouteAuthState<Session, User> | Promise<RouteAuthState<Session, User>>;

export interface RouteAuthOptions<Session = unknown, User = unknown> {
  resolve: RouteAuthResolver<Session, User>;
  loginPath?:
    | string
    | ((context: RouteContext<Session, User>) => string | Promise<string>);
  guestRedirectTo?:
    | string
    | ((context: RouteContext<Session, User>) => string | Promise<string>);
  hasRole?: (
    user: User,
    role: string,
    context: RouteContext<Session, User>
  ) => boolean | Promise<boolean>;
  hasPermission?: (
    user: User,
    permission: string,
    context: RouteContext<Session, User>
  ) => boolean | Promise<boolean>;
}

export interface CommonAccessOptions {
  auth?: RouteAuthMode;
  role?: string;
  permission?: string;
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
export interface RouteOptions extends CommonAccessOptions {
  loader?: (context: { params: Record<string, string> }) => unknown;
  entries?: () =>
    | Array<Record<string, string>>
    | Promise<Array<Record<string, string>>>;
  title?: string;
  namespace?: string;
}

export interface PageHelperOptions extends CommonAccessOptions {}

/**
 * A single parsed segment from a route path.
 *
 * - `static`:   a literal path segment, e.g. `"users"` in `/users/{id}`
 * - `param`:    a `{name}` capture group — `value` holds the param name
 * - `wildcard`: a bare `*` segment that captures exactly one segment
 * - `catchall`: the `/*` catch-all that matches any depth
 */
export interface ParsedSegment {
  kind: 'static' | 'param' | 'wildcard' | 'catchall';
  /** For static/wildcard/catchall: the literal text; for param: the param name. */
  value: string;
}

/** Resolved layout component as stored in a route record's layout chain. */
export interface LayoutScopeRecord {
  component: (props: { children?: unknown }) => unknown;
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
  signal?: AbortSignal;
}

export interface RouteRenderResult {
  kind: 'render';
  handler: RouteHandler;
  params: Record<string, string>;
}

export type RouteRequestResult =
  | RouteRenderResult
  | AccessRedirectDecision
  | AccessDenyDecision
  | null;

export interface GroupHelperOptions extends CommonAccessOptions {
  layout?: (props: { children?: unknown }) => unknown;
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

export interface RouteHandler {
  (params: Record<string, string>, context?: { signal: AbortSignal }): unknown;
}

export interface Route {
  path: string;
  handler: RouteHandler;
  namespace?: string;
}

export interface ResolvedRoute {
  handler: RouteHandler;
  params: Record<string, string>;
}

export interface RouteMatch {
  path: string;
  params: Readonly<Record<string, string>>;
  name?: string;
  namespace?: string;
}

export interface RouteQuery {
  get(key: string): string | null;
  getAll(key: string): string[];
  has(key: string): boolean;
  toJSON(): Record<string, string | string[]>;
}

export interface RouteSnapshot {
  path: string;
  params: Readonly<Record<string, string>>;
  query: Readonly<RouteQuery>;
  hash: string | null;

  name?: string;
  namespace?: string;
  matches: readonly RouteMatch[];
}
