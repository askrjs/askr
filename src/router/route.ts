/**
 * Route definition and matching
 * Supports dynamic route registration for micro frontends
 *
 * Optimization: Index by depth but maintain insertion order within each depth
 */

import { match as matchPath } from './match';
import { getCurrentComponentInstance } from '../runtime/component';

export type {
  RouteHandler,
  Route,
  ResolvedRoute,
  RouteMatch,
  RouteQuery,
  RouteSnapshot,
} from '../common/router';

import type {
  RouteHandler,
  Route,
  ResolvedRoute,
  RouteMatch,
  RouteQuery,
  RouteSnapshot,
} from '../common/router';

const routes: Route[] = [];
const namespaces = new Set<string>();

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

// Compute matches by scanning registered routes (public API: getRoutes)
function computeMatches(pathname: string): RouteMatch[] {
  const routesList = getRoutes();
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

/**
 * Dual-purpose `route` function:
 * - route() → returns a read-only, deeply frozen RouteSnapshot (render-time)
 * - route(path, handler, namespace?) → registers a route handler (existing semantics)
 */
// Prevent runtime registrations after the app has started
let registrationLocked = false;

export function lockRouteRegistration(): void {
  registrationLocked = true;
}

// Internal test helpers
export function _lockRouteRegistrationForTests(): void {
  registrationLocked = true;
}

export function _unlockRouteRegistrationForTests(): void {
  registrationLocked = false;
}

export function route(): RouteSnapshot;
export function route(
  path: string,
  handler?: RouteHandler,
  namespace?: string
): void;
export function route(
  path?: string,
  handler?: RouteHandler,
  namespace?: string
): void | RouteSnapshot {
  // If called with no args, act as render-time accessor
  if (typeof path === 'undefined') {
    // Access the current component instance to ensure route() is only
    // called during render.
    const instance = getCurrentComponentInstance();
    if (!instance) {
      throw new Error(
        'route() can only be called during component render execution. ' +
          'Call route() from inside your component function.'
      );
    }

    // Determine location source: client window if present; otherwise SSR override
    let pathname = '/';
    let search = '';
    let hash = '';

    if (typeof window !== 'undefined' && window.location) {
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
    const matches = computeMatches(pathname);

    const snapshot: RouteSnapshot = Object.freeze({
      path: pathname,
      params,
      query,
      hash: hash || null,
      matches: Object.freeze(matches),
    });

    return snapshot;
  }

  // Disallow route registration during SSR render
  const currentInst = getCurrentComponentInstance();
  if (currentInst && currentInst.ssr) {
    throw new Error(
      'route() cannot be called during SSR rendering. Register routes at module load time instead.'
    );
  }

  // Disallow registrations after app startup
  if (registrationLocked) {
    throw new Error(
      'Route registration is locked after app startup. Register routes at module load time before calling createIsland().'
    );
  }

  // Otherwise register a route (backwards compatible behavior)
  if (typeof handler !== 'function') {
    throw new Error(
      'route(path, handler) requires a function handler that returns a VNode (e.g. () => <Page />). ' +
        'Passing JSX elements or VNodes directly is not supported.'
    );
  }

  const routeObj: Route = { path, handler: handler as RouteHandler, namespace };
  routes.push(routeObj);

  // Index by depth (maintains insertion order within depth)
  const depth = getDepth(path);

  let depthRoutes = routesByDepth.get(depth);
  if (!depthRoutes) {
    depthRoutes = [];
    routesByDepth.set(depth, depthRoutes);
  }

  depthRoutes.push(routeObj);

  if (namespace) {
    namespaces.add(namespace);
  }
}

/**
 * Get all registered routes
 */
export function getRoutes(): Route[] {
  return [...routes];
}

/**
 * Get routes for a specific namespace
 */
export function getNamespaceRoutes(namespace: string): Route[] {
  return routes.filter((r) => r.namespace === namespace);
}

/**
 * Unload all routes from a namespace (for MFE unmounting)
 */
export function unloadNamespace(namespace: string): number {
  const before = routes.length;

  // Remove from main array
  for (let i = routes.length - 1; i >= 0; i--) {
    if (routes[i].namespace === namespace) {
      const removed = routes[i];
      routes.splice(i, 1);

      // Remove from depth index
      const depth = getDepth(removed.path);
      const depthRoutes = routesByDepth.get(depth);
      if (depthRoutes) {
        const idx = depthRoutes.indexOf(removed);
        if (idx >= 0) {
          depthRoutes.splice(idx, 1);
        }
      }
    }
  }

  namespaces.delete(namespace);
  return before - routes.length;
}

/**
 * Clear all registered routes (mainly for testing)
 */
export function clearRoutes(): void {
  routes.length = 0;
  namespaces.clear();
  routesByDepth.clear();
}

/**
 * RouteDescriptor type — used by `registerRoute` for nested descriptors.
 *
 * Note: `registerRouteTree` helper was removed; prefer explicit `route()` registrations.
 */
export type RouteDescriptor = {
  path: string;
  handler?: RouteHandler | unknown;
  children?: RouteDescriptor[];
  _isDescriptor?: true;
};

// `registerRouteTree` was removed — register explicit absolute paths with `route(path, handler)` instead.
// If you need a helper to register descriptor trees, add a small wrapper in userland that
// calls `route()` recursively.

// Helper: normalize common handler shapes
// NOTE: Only function handlers are accepted — passing raw JSX/VNodes at register
// time is not allowed. This keeps registration data-only and avoids surprising
// semantics between module-load-time and render-time.
function normalizeHandler(handler: unknown): RouteHandler | undefined {
  if (handler == null) return undefined;
  if (typeof handler === 'function') {
    // Accept both (params) => ... handlers and component functions that take no args / props
    return (params: Record<string, string>, ctx?: { signal?: AbortSignal }) => {
      // Call with params and ctx; component functions can ignore them
      // Allow handler to return JSX element, VNode, Promise, etc.
      // If the function expects only props, passing params is safe (extra args ignored)
      try {
        return handler(params, ctx);
      } catch {
        return handler(params);
      }
    };
  }
  return undefined;
}

// Register route with flexible handler shapes and optional nested descriptors.
// Usage patterns supported:
// - Absolute flat registration: registerRoute('/pages', () => List())
// - Nested descriptors: registerRoute('/', () => Home(), registerRoute('pages', () => List(), registerRoute('{id}', () => Detail())))
//   Note: child descriptors should use relative paths (no leading '/').
export function registerRoute(
  path: string,
  handler?: unknown,
  ...children: Array<RouteDescriptor | undefined>
): RouteDescriptor {
  const isRelative = !path.startsWith('/');

  // Build descriptor that can be used for nesting
  const descriptor: RouteDescriptor = {
    path,
    handler,
    children: children.filter(Boolean) as RouteDescriptor[],
    _isDescriptor: true,
  };

  // If path is absolute, perform registration immediately and recurse into children
  if (!isRelative) {
    const normalized = normalizeHandler(handler);
    if (handler != null && !normalized) {
      throw new Error(
        'registerRoute(path, handler) requires a function handler. Passing JSX elements or VNodes directly is not supported.'
      );
    }
    if (normalized) route(path, normalized);

    for (const child of descriptor.children || []) {
      // Compute child full path
      const base = path === '/' ? '' : path.replace(/\/$/, '');
      const childPath = `${base}/${child.path.replace(/^\//, '')}`.replace(
        /\/\//g,
        '/'
      );
      // Recurse: if child.handler is provided, register it
      if (child.handler) {
        const childNormalized = normalizeHandler(child.handler);
        if (!childNormalized) {
          throw new Error(
            'registerRoute child handler must be a function. Passing JSX elements directly is not supported.'
          );
        }
        if (childNormalized) route(childPath, childNormalized);
      }
      // Recurse into grandchildren
      if (child.children && child.children.length) {
        // Convert child.children into descriptors and register them
        // Use registerRoute recursively with absolute childPath
        registerRoute(
          childPath,
          null,
          ...(child.children as RouteDescriptor[])
        );
      }
    }

    return descriptor;
  }

  // If relative, return descriptor for nesting (do not register yet)
  return descriptor;
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

  // Try routes at this depth first (most likely match)
  const depthRoutes = routesByDepth.get(depth);
  if (depthRoutes) {
    for (const r of depthRoutes) {
      const result = matchPath(pathname, r.path);
      if (result.matched) {
        candidates.push({
          route: r,
          specificity: getSpecificity(r.path),
          params: result.params,
        });
      }
    }
  }

  // Fallback: scan all routes for different depths
  // (handles edge cases like wildcard routes)
  for (const r of routes) {
    // Skip if already checked in depth routes
    if (depthRoutes?.includes(r)) continue;

    const result = matchPath(pathname, r.path);
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
