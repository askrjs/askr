/**
 * Route definition, registration, and matching.
 *
 * The authoritative implementation for the unified route model:
 *   - `layout(Component, fn)` — declare a layout scope containing child routes
 *   - `route(path, Component, options?)` — declare a route inside a layout scope
 *   - `route()` (no args) — read the current route snapshot inside a component
 *   - `getManifest()` — retrieve the normalized route graph for SPA / SSR / SSG
 */

import { matchSegments, parseSegments, computeRank } from './match';
import { getCurrentComponentInstance } from '../runtime/component';
import { getExecutionModel } from '../runtime/execution-model';
import { getRenderContext } from '../ssr/context';

export type {
  RouteHandler,
  Route,
  ResolvedRoute,
  RouteMatch,
  RouteQuery,
  RouteSnapshot,
  RouteComponent,
  RouteOptions,
  ParsedSegment,
  LayoutScopeRecord,
  RouteRecord,
  RouteManifest,
} from '../common/router';

import type {
  RouteHandler,
  Route,
  ResolvedRoute,
  RouteMatch,
  RouteQuery,
  RouteSnapshot,
  RouteComponent,
  RouteOptions,
  LayoutScopeRecord,
  RouteRecord,
  RouteManifest,
} from '../common/router';

// ---------------------------------------------------------------------------
// Module-level stores
// ---------------------------------------------------------------------------

/** Legacy flat route array — kept for resolver and route() accessor backward compat. */
const routes: Route[] = [];

/** Normalized route records built by the declarative registration API. */
const records: RouteRecord[] = [];

/** Active layout scope stack during module-load-time registration. */
const layoutStack: LayoutScopeRecord[] = [];

const namespaces = new Set<string>();

const HAS_ROUTES_KEY = Symbol.for('__ASKR_HAS_ROUTES__');

function setHasRoutes(value: boolean): void {
  try {
    const g = globalThis as unknown as Record<string | symbol, unknown>;
    g[HAS_ROUTES_KEY] = value;
  } catch {
    // ignore
  }
}

// Initialize to false at module load.
setHasRoutes(false);

// Route index by depth - maintains insertion order
const routesByDepth = new Map<number, Route[]>();

/**
 * Parse route path depth
 */
function getDepth(path: string): number {
  const normalized =
    path.endsWith('/') && path !== '/' ? path.slice(0, -1) : path;
  return normalized === '/' ? 0 : normalized.split('/').filter(Boolean).length;
}

// ---------------------------------------------------------------------------
// WeakMap caches for external Route[] objects (e.g. SSR per-request tables)
// Amortises parseSegments / computeRank across repeated resolveRouteFromRoutes
// calls on the same route list (same object reference).
// ---------------------------------------------------------------------------

/** Pre-parsed segments for an externally supplied Route object. */
const routeSegsCache = new WeakMap<Route, ReturnType<typeof parseSegments>>();
/** Pre-computed rank for an externally supplied Route object. */
const routeRankCache = new WeakMap<Route, number>();
/** A rank-descending sorted copy of an external readonly Route array. */
const sortedListCache = new WeakMap<
  ReadonlyArray<Route>,
  ReadonlyArray<Route>
>();

function cachedSegs(r: Route): ReturnType<typeof parseSegments> {
  let s = routeSegsCache.get(r);
  if (!s) {
    s = parseSegments(r.path);
    routeSegsCache.set(r, s);
  }
  return s;
}

function cachedRank(r: Route): number {
  let n = routeRankCache.get(r);
  if (n === undefined) {
    n = computeRank(cachedSegs(r));
    routeRankCache.set(r, n);
  }
  return n;
}

function cachedSortedList(
  routeList: ReadonlyArray<Route>
): ReadonlyArray<Route> {
  let sorted = sortedListCache.get(routeList);
  if (!sorted) {
    sorted = [...routeList].sort((a, b) => cachedRank(b) - cachedRank(a));
    sortedListCache.set(routeList, sorted);
  }
  return sorted;
}

// SSR helper: when rendering on the server, callers may set a location so that
// render-time route() returns deterministic server values that match client
// hydration. This is deliberately an opt-in escape for SSR and tests.
let serverLocation: string | null = null;

export function setServerLocation(url: string | null): void {
  serverLocation = url;
}

// Helper: parse a URL string into components
function parseLocation(url: string) {
  try {
    const u = new URL(url, 'http://localhost');
    return { pathname: u.pathname, search: u.search, hash: u.hash };
  } catch {
    return { pathname: '/', search: '', hash: '' };
  }
}

// Deep freeze utility for small objects
function deepFreeze<T>(obj: T): T {
  if (obj && typeof obj === 'object' && !Object.isFrozen(obj)) {
    Object.freeze(obj as Record<string, unknown>);
    for (const key of Object.keys(obj as Record<string, unknown>)) {
      const value = (obj as Record<string, unknown>)[key];
      if (value && typeof value === 'object') deepFreeze(value);
    }
  }
  return obj;
}

// Build an immutable query helper from a search string
function makeQuery(search: string): RouteQuery {
  const usp = new URLSearchParams(search || '');
  const mapping = new Map<string, string[]>();
  for (const [k, v] of usp.entries()) {
    const existing = mapping.get(k);
    if (existing) existing.push(v);
    else mapping.set(k, [v]);
  }

  const obj: RouteQuery = {
    get(key: string) {
      const arr = mapping.get(key);
      return arr ? arr[0] : null;
    },
    getAll(key: string) {
      const arr = mapping.get(key);
      return arr ? [...arr] : [];
    },
    has(key: string) {
      return mapping.has(key);
    },
    toJSON() {
      const out: Record<string, string | string[]> = {};
      for (const [k, arr] of mapping.entries()) {
        out[k] = arr.length > 1 ? [...arr] : arr[0];
      }
      return out;
    },
  };

  return deepFreeze(obj);
}

// Compute matches for a specific route list.
function computeMatchesFromRoutes(
  pathname: string,
  routesList: readonly Route[]
): RouteMatch[] {
  const matches: Array<{
    pattern: string;
    params: Record<string, string>;
    name?: string;
    namespace?: string;
    rank: number;
  }> = [];

  const normalized =
    pathname.endsWith('/') && pathname !== '/'
      ? pathname.slice(0, -1)
      : pathname;
  const urlParts =
    normalized === '/' ? [] : normalized.split('/').filter(Boolean);

  for (const r of routesList) {
    const params = matchSegments(urlParts, cachedSegs(r));
    if (params !== null) {
      matches.push({
        pattern: r.path,
        params,
        name: (r as { name?: string }).name,
        namespace: r.namespace,
        rank: cachedRank(r),
      });
    }
  }

  matches.sort((a, b) => b.rank - a.rank);

  return matches.map((m) => ({
    path: m.pattern,
    params: deepFreeze({ ...m.params }),
    name: m.name,
    namespace: m.namespace,
  }));
}

function getActiveRoutes(): readonly Route[] {
  const renderContext = getRenderContext();
  return renderContext?.routes ?? routes;
}

// ---------------------------------------------------------------------------
// Registration lock
// ---------------------------------------------------------------------------

/**
 * Prevent route registrations after the app has started.
 * Enforced in production; tests may unlock explicitly.
 */
let registrationLocked = false;

export function lockRouteRegistration(): void {
  registrationLocked = true;
}

export function _lockRouteRegistrationForTests(): void {
  registrationLocked = true;
}

export function _unlockRouteRegistrationForTests(): void {
  registrationLocked = false;
}

// ---------------------------------------------------------------------------
// Path validation
// ---------------------------------------------------------------------------

function validateRoutePath(path: string): void {
  if (!path.startsWith('/')) {
    throw new Error(`Route path must begin with "/". Got: "${path}"`);
  }
  // Reject Express-style :param syntax — Askr uses {param} interpolation
  if (/:([^/{}]+)/.test(path)) {
    const suggested = path.replace(/:([^/{}]+)/g, '{$1}');
    throw new Error(
      `Route parameter syntax uses {name} interpolation, not :name. ` +
        `Use "${suggested}" instead of "${path}".`
    );
  }
}

// ---------------------------------------------------------------------------
// Internal helper: insert a RouteRecord in rank-descending order
// so that resolveRoute can use first-match-wins without sorting.
// Ties preserve declaration order (stable binary-search insertion).
// ---------------------------------------------------------------------------

function insertRecordSorted(record: RouteRecord): void {
  let lo = 0;
  let hi = records.length;
  // Find the insertion point: after all existing records with rank >= this one
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (records[mid].rank >= record.rank) lo = mid + 1;
    else hi = mid;
  }
  records.splice(lo, 0, record);
}

// ---------------------------------------------------------------------------
// Internal helper: add a single pre-built Route object to the runtime stores
// ---------------------------------------------------------------------------

function addRouteToStores(routeObj: Route): void {
  routes.push(routeObj);
  setHasRoutes(true);

  const depth = getDepth(routeObj.path);
  let depthRoutes = routesByDepth.get(depth);
  if (!depthRoutes) {
    depthRoutes = [];
    routesByDepth.set(depth, depthRoutes);
  }
  depthRoutes.push(routeObj);

  if (routeObj.namespace) {
    namespaces.add(routeObj.namespace);
  }
}

// ---------------------------------------------------------------------------
// lazy() — eager-prefetch code-split component wrapper
// ---------------------------------------------------------------------------

/** Promises from in-flight lazy() imports, drained by createSPA / hydrateSPA. */
const pendingLazy = new Set<Promise<unknown>>();

/**
 * Snapshot the current in-flight lazy() imports.
 * Boot uses this before clearing route state so manifest-based startup can
 * still await chunks that were kicked off during route module evaluation.
 */
export function _snapshotLazy(): Promise<unknown>[] {
  return [...pendingLazy];
}

/**
 * Declare a code-split route component. The `import()` fires immediately at
 * module evaluation time (creating a bundler split point), and the resolved
 * chunk is guaranteed to be available before the app mounts — so the renderer
 * always receives a plain synchronous function.
 *
 * ```ts
 * layout(AppLayout, () => {
 *   route('/',          lazy(() => import('./pages/landing')));
 *   route('/dashboard', lazy(() => import('./pages/dashboard')));
 * });
 * ```
 *
 * The module must export the component as its **default** export:
 * ```ts
 * // pages/dashboard.tsx
 * export default function DashboardPage() { … }
 * ```
 */
export function lazy(
  factory: () => Promise<{ default: RouteComponent } | RouteComponent>
): RouteComponent {
  let resolved: RouteComponent | null = null;
  let loadError: unknown = null;

  const promise = factory().then(
    (mod) => {
      resolved =
        typeof mod === 'function'
          ? mod
          : (mod as { default: RouteComponent }).default;
      pendingLazy.delete(promise);
    },
    (err: unknown) => {
      loadError = err;
      pendingLazy.delete(promise);
    }
  );
  pendingLazy.add(promise);

  return (params) => {
    if (loadError) throw loadError as Error;
    if (!resolved) {
      throw new Error(
        'lazy() component used before it was resolved. ' +
          'Await createSPA() / hydrateSPA() to ensure all chunks load first.'
      );
    }
    return resolved(params);
  };
}

/**
 * Wait for all pending `lazy()` imports to settle.
 * Called automatically by `createSPA` / `hydrateSPA` before mounting.
 */
export function _drainLazy(
  additionalPending: Iterable<Promise<unknown>> = []
): Promise<void> {
  const combined = new Set<Promise<unknown>>([
    ...additionalPending,
    ...pendingLazy,
  ]);
  if (combined.size === 0) return Promise.resolve();
  return Promise.allSettled([...combined]).then(() => undefined);
}

// ---------------------------------------------------------------------------
// layout() — scoped registration primitive
// ---------------------------------------------------------------------------

/**
 * Declare a layout scope.  All `route()` calls executed inside `fn` will
 * automatically be wrapped by `Component`, outermost to innermost.
 *
 * ```ts
 * layout(AppLayout, () => {
 *   route('/',        LandingPage);
 *   route('/about',   AboutPage);
 *   route('/*',       ErrorPage);
 * });
 * ```
 *
 * Layouts may nest:
 * ```ts
 * layout(AppShell, () => {
 *   layout(AdminShell, () => {
 *     route('/admin', AdminDashboard);
 *   });
 *   route('/', HomePage);
 * });
 * ```
 */
export function layout<P = object>(
  Component: (props: P & { children?: unknown }) => unknown,
  fn: () => void
): void {
  layoutStack.push({ component: Component as LayoutScopeRecord['component'] });
  try {
    fn();
  } finally {
    layoutStack.pop();
  }
}

// ---------------------------------------------------------------------------
// route() — dual-purpose: registration (module load) + accessor (render time)
// ---------------------------------------------------------------------------

/**
 * Register a route.
 *
 * ```ts
 * route('/posts/{slug}', PostPage, {
 *   load:    ({ params }) => getPost(params.slug),
 *   entries: async () => getPosts().map(p => ({ slug: p.slug })),
 *   title:   'Post',
 *   guard:   requireAuth,
 * });
 * ```
 *
 * When called with **no arguments** inside a component, returns the current
 * read-only `RouteSnapshot` (path, params, query, hash, matches).
 */
export function route(): RouteSnapshot;
export function route(
  path: string,
  Component: RouteComponent,
  options?: RouteOptions
): void;
export function route(
  path?: string,
  Component?: RouteComponent,
  options?: RouteOptions
): void | RouteSnapshot {
  if (getExecutionModel() === 'islands') {
    throw new Error(
      'Routes are not supported with islands. Use createSPA (client) or createSSR (server) instead.'
    );
  }

  // ── Render-time accessor (no arguments) ─────────────────────────────────
  if (typeof path === 'undefined') {
    const instance = getCurrentComponentInstance();
    if (!instance) {
      throw new Error(
        'route() can only be called during component render execution. ' +
          'Call route() from inside your component function.'
      );
    }

    let pathname = '/';
    let search = '';
    let hash = '';
    const renderContext = getRenderContext();

    if (instance.ssr && renderContext?.url) {
      const parsed = parseLocation(renderContext.url);
      pathname = parsed.pathname;
      search = parsed.search;
      hash = parsed.hash;
    } else if (typeof window !== 'undefined' && window.location) {
      pathname = window.location.pathname || '/';
      search = window.location.search || '';
      hash = window.location.hash || '';
    } else if (serverLocation) {
      const parsed = parseLocation(serverLocation);
      pathname = parsed.pathname;
      search = parsed.search;
      hash = parsed.hash;
    }

    const params = deepFreeze({
      ...((instance.props as Record<string, string>) || {}),
    });
    const query = makeQuery(search);
    const matches = computeMatchesFromRoutes(pathname, getActiveRoutes());

    const snapshot: RouteSnapshot = Object.freeze({
      path: pathname,
      params,
      query,
      hash: hash || null,
      matches: Object.freeze(matches),
    });

    return snapshot;
  }

  // ── Registration mode ────────────────────────────────────────────────────

  // Disallow registration during SSR render
  const currentInst = getCurrentComponentInstance();
  if (currentInst && currentInst.ssr) {
    throw new Error(
      'route() cannot be called during SSR rendering. Register routes at module load time instead.'
    );
  }

  if (registrationLocked) {
    throw new Error(
      'Route registration is locked after app startup. ' +
        'Register routes at module load time before calling createSPA or createSSR.'
    );
  }

  if (typeof Component !== 'function') {
    throw new Error(
      'route(path, Component) requires a component function as the second argument. ' +
        'Passing JSX elements or VNodes directly is not supported.'
    );
  }

  validateRoutePath(path);

  // Snapshot the current layout chain (outermost scope first)
  const chain: LayoutScopeRecord[] = [...layoutStack];
  const segments = parseSegments(path);
  const rank = computeRank(segments);
  const isFallback = path === '/*';
  const comp = Component;

  // Build a runtime handler that auto-composes the layout chain around the
  // page component.  The handler is RouteHandler-compatible so navigation,
  // SSR, and SSG can all call it without knowing the chain internals.
  const handler: RouteHandler = (params) => {
    let content: unknown = comp(params);
    // Apply layouts from innermost to outermost
    for (let i = chain.length - 1; i >= 0; i--) {
      content = chain[i].component({ children: content });
    }
    return content;
  };

  const record: RouteRecord = {
    path,
    component: comp,
    segments,
    rank,
    layoutChain: chain,
    options: { ...options },
    isFallback,
    handler,
  };

  insertRecordSorted(record);
  addRouteToStores({ path, handler, namespace: options?.namespace });
}

// ---------------------------------------------------------------------------
// Manifest access
// ---------------------------------------------------------------------------

/**
 * Return the normalized route manifest built from all `layout()` / `route()`
 * declarations that have run so far.
 *
 * Pass this to `createSPA`, `hydrateSPA`, or `renderToString` as the
 * authoritative routing input:
 *
 * ```ts
 * import { getManifest } from '@askrjs/askr/router';
 * await createSPA({ root: '#app', manifest: getManifest() });
 * ```
 */
export function getManifest(): RouteManifest {
  return { records: [...records] };
}

/**
 * Internal: apply a pre-built manifest to the runtime stores without running
 * route() again.  Called by createSPA / hydrateSPA when a manifest is passed.
 */
export function _applyManifest(manifest: RouteManifest): void {
  for (const record of manifest.records) {
    records.push(record);
    addRouteToStores({
      path: record.path,
      handler: record.handler,
      namespace: record.options.namespace,
    });
  }
  // Sort once after bulk insert so resolveRoute can use first-match-wins
  records.sort((a, b) => b.rank - a.rank);
}

// ---------------------------------------------------------------------------
// Route collection helpers
// ---------------------------------------------------------------------------

/**
 * Get all registered routes (flat list, insertion order).
 * Prefer `getManifest()` when metadata (load, guard, entries) is needed.
 */
export function getRoutes(): Route[] {
  return [...routes];
}

/** Get routes for a specific namespace. */
export function getNamespaceRoutes(namespace: string): Route[] {
  return routes.filter((r) => r.namespace === namespace);
}

/** Unload all routes from a namespace (for MFE unmounting). */
export function unloadNamespace(namespace: string): number {
  const before = routes.length;

  for (let i = routes.length - 1; i >= 0; i--) {
    if (routes[i].namespace === namespace) {
      const removed = routes[i];
      routes.splice(i, 1);

      const depth = getDepth(removed.path);
      const depthRoutes = routesByDepth.get(depth);
      if (depthRoutes) {
        const idx = depthRoutes.indexOf(removed);
        if (idx >= 0) depthRoutes.splice(idx, 1);
      }
    }
  }

  // Remove matching records too
  for (let i = records.length - 1; i >= 0; i--) {
    if (records[i].options.namespace === namespace) {
      records.splice(i, 1);
    }
  }

  namespaces.delete(namespace);
  return before - routes.length;
}

/** Clear all registered routes and records (testing / boot reset). */
export function clearRoutes(): void {
  routes.length = 0;
  records.length = 0;
  namespaces.clear();
  routesByDepth.clear();
  registrationLocked = false;
  setHasRoutes(false);
  pendingLazy.clear();
}

/**
 * Get all loaded namespaces (MFE identifiers)
 */
export function getLoadedNamespaces(): string[] {
  return Array.from(namespaces);
}

/**
 * Resolve a path to a route handler.
 *
 * Hot path: walks the module-level `records[]` array which is kept sorted by
 * rank descending at registration time — so the first `matchSegments` hit is
 * always the most specific match.  No per-call allocations for the common
 * case of purely-static routes.
 */
export function resolveRoute(pathname: string): ResolvedRoute | null {
  const normalized =
    pathname.endsWith('/') && pathname !== '/'
      ? pathname.slice(0, -1)
      : pathname;
  const urlParts =
    normalized === '/' ? [] : normalized.split('/').filter(Boolean);

  for (const record of records) {
    const params = matchSegments(urlParts, record.segments);
    if (params !== null) {
      return { handler: record.handler, params };
    }
  }
  return null;
}

/**
 * Resolve a path against an explicit route list (e.g. an SSR per-render
 * context).  When called with the global `routes` array this delegates to
 * the faster `resolveRoute` which uses pre-sorted `records[]`.
 *
 * For externally supplied lists the function:
 *   1. Builds a rank-sorted copy of the list on first call and caches it
 *      in a WeakMap so subsequent resolutions against the same list pay
 *      zero sort cost.
 *   2. Uses pre-parsed `ParsedSegment[]` from a WeakMap cache so no string
 *      splitting or segment parsing occurs on the hot path.
 *   3. Uses a running-best with an early-exit once the sorted list reaches
 *      a rank that cannot beat the current best match.
 */
export function resolveRouteFromRoutes(
  pathname: string,
  routeList: readonly Route[]
): ResolvedRoute | null {
  if (routeList === routes) return resolveRoute(pathname);

  const normalized =
    pathname.endsWith('/') && pathname !== '/'
      ? pathname.slice(0, -1)
      : pathname;
  const urlParts =
    normalized === '/' ? [] : normalized.split('/').filter(Boolean);

  // Use the rank-sorted cached copy so we can exit as soon as the rank
  // drops below the current best — typically saving 30-50% of iterations.
  const sorted = cachedSortedList(routeList);
  let bestHandler: RouteHandler | null = null;
  let bestParams: Record<string, string> = {};
  let bestRank = -Infinity;

  for (const r of sorted) {
    const rank = cachedRank(r);
    // sorted descending: once rank < bestRank every remaining route loses
    if (rank < bestRank) break;
    // already have the best match at this rank (first-declared wins)
    if (bestHandler !== null && rank === bestRank) continue;
    const params = matchSegments(urlParts, cachedSegs(r));
    if (params !== null) {
      bestHandler = r.handler;
      bestParams = params;
      bestRank = rank;
    }
  }

  return bestHandler !== null
    ? { handler: bestHandler, params: bestParams }
    : null;
}
