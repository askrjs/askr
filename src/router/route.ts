/**
 * Route definition, registration, and matching.
 *
 * The authoritative implementation for the unified route model:
 *   - `layout(Component, fn)` — declare a layout scope containing child routes
 *   - `route(path, Component, options?)` — declare a route inside a layout scope
 *   - `route()` (no args) — read the current route snapshot inside a component
 *   - `getManifest()` — retrieve the normalized route graph for SPA / SSR / SSG
 */

import { match as matchPath } from './match';
import { parseSegments, computeRank } from './match';
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

/**
 * Calculate route specificity for priority matching
 * Higher score = more specific
 * - Literal segments: 3 points each
 * - Parameter segments ({id}): 2 points each
 * - Wildcard segments (*): 1 point each
 * - Catch-all (/*): 0 points
 */
function getSpecificity(path: string): number {
  const normalized =
    path.endsWith('/') && path !== '/' ? path.slice(0, -1) : path;

  // Special case: catch-all pattern
  if (normalized === '/*') {
    return 0;
  }

  const segments = normalized.split('/').filter(Boolean);
  let score = 0;

  for (const segment of segments) {
    if (segment.startsWith('{') && segment.endsWith('}')) {
      score += 2; // Parameter
    } else if (segment === '*') {
      score += 1; // Wildcard
    } else {
      score += 3; // Literal
    }
  }

  return score;
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
    specificity: number;
  }> = [];

  function getSpecificity(path: string) {
    // Reuse same heuristic as above
    const normalized =
      path.endsWith('/') && path !== '/' ? path.slice(0, -1) : path;
    if (normalized === '/*') return 0;
    const segments = normalized.split('/').filter(Boolean);
    let score = 0;
    for (const segment of segments) {
      if (segment.startsWith('{') && segment.endsWith('}')) score += 2;
      else if (segment === '*') score += 1;
      else score += 3;
    }
    return score;
  }

  for (const r of routesList) {
    const result = matchPath(pathname, r.path);
    if (result.matched) {
      matches.push({
        pattern: r.path,
        params: result.params,
        name: (r as { name?: string }).name,
        namespace: r.namespace,
        specificity: getSpecificity(r.path),
      });
    }
  }

  matches.sort((a, b) => b.specificity - a.specificity);

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

  records.push(record);
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
}

/**
 * Get all loaded namespaces (MFE identifiers)
 */
export function getLoadedNamespaces(): string[] {
  return Array.from(namespaces);
}

/**
 * Resolve a path to a route handler with optimized lookup
 * Routes are matched by specificity: literals > parameters > wildcards > catch-all
 */
export function resolveRoute(pathname: string): ResolvedRoute | null {
  return resolveRouteFromRoutes(pathname, routes);
}

export function resolveRouteFromRoutes(
  pathname: string,
  routeList: readonly Route[]
): ResolvedRoute | null {
  const normalized =
    pathname.endsWith('/') && pathname !== '/'
      ? pathname.slice(0, -1)
      : pathname;
  const depth =
    normalized === '/' ? 0 : normalized.split('/').filter(Boolean).length;

  // Collect all matching routes with their specificity
  const candidates: Array<{
    route: Route;
    specificity: number;
    params: Record<string, string>;
  }> = [];

  // Try same-depth routes first when resolving the global client table.
  // For explicit per-render route lists, fall back to a full scan.
  const depthRoutes =
    routeList === routes ? routesByDepth.get(depth) : undefined;
  if (depthRoutes) {
    for (const r of depthRoutes) {
      const result = matchPath(normalized, r.path);
      if (result.matched) {
        candidates.push({
          route: r,
          specificity: getSpecificity(r.path),
          params: result.params,
        });
      }
    }
  }

  // Fallback: scan all routes for different depths or explicit render-local tables.
  for (const r of routeList) {
    // Skip if already checked in depth routes
    if (depthRoutes?.includes(r)) continue;

    const result = matchPath(normalized, r.path);
    if (result.matched) {
      candidates.push({
        route: r,
        specificity: getSpecificity(r.path),
        params: result.params,
      });
    }
  }

  // Sort by specificity (highest first)
  candidates.sort((a, b) => b.specificity - a.specificity);

  // Return most specific match
  if (candidates.length > 0) {
    const best = candidates[0];
    return { handler: best.route.handler, params: best.params };
  }

  return null;
}
