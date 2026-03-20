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

/**
 * Options for `route()` declarations.
 *
 * - `load`: server data loader called before render, result passed as SSR data
 * - `entries`: SSG entry generator — returns one param map per static page
 * - `guard`: navigation guard — return `false` to block or a path string to redirect
 * - `title`: page title hint used by SSG and document-meta integrations
 * - `namespace`: MFE namespace key for grouped route management
 */
export interface RouteOptions {
  load?: (context: { params: Record<string, string> }) => unknown;
  entries?: () =>
    | Array<Record<string, string>>
    | Promise<Array<Record<string, string>>>;
  guard?: (context: {
    params: Record<string, string>;
  }) => boolean | string | Promise<boolean | string>;
  title?: string;
  namespace?: string;
}

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
  /** Route metadata: load, entries, guard, title, namespace */
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
 * The normalized route manifest produced by a set of `layout()` and `route()`
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
