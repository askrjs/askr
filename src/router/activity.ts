import type {
  Route,
  RouteMatch,
  RouteParams,
  RouteSearch,
  RouteSnapshot,
} from '../common/router';
import {
  getStagedAppRenderRouteLocation,
  getStagedAppRenderRouteState,
} from '../common/app-render-runtime';
import { syncRouteActivitySnapshot } from '../common/route-activity';
import { getActiveRenderContext } from '../common/render-context';
import {
  currentAppRuntime as getCurrentAppRenderRuntime,
  currentComponent as getCurrentComponentInstance,
  hookSlot,
  onCommit,
} from '../core/api/hooks';
import { createSource, notify, readSource } from '../core/api/hooks';
import { deepFreeze, makeQuery, parseLocation } from './route-context';
import { canonicalMatchPath, computeMatchesFromRoutes } from './route-matching';
import {
  getActiveRouteBasePath,
  getActiveRoutes,
  getRoutePathPolicy,
  getRouteTableVersion,
} from './store';
import { removeRouteBasePath } from './base-path';
import type { InternalRoute } from './internal-types';
import { emptyRouteSearch, parseRouteSearch } from './route-search';

/** Options for {@link onRouteChange}. */
export interface RouteChangeOptions {
  immediate?: boolean;
}
/** Optional cleanup returned by an {@link onRouteChange} callback, run before the next change. */
export type RouteChangeCleanup = void | (() => void);
type RouteChangeSlot = {
  kind: 'route-change';
  previous: RouteSnapshot | null;
  cleanup: (() => void) | null;
  cleanupRegistered: boolean;
};
function routeSignature(route: RouteSnapshot): string {
  return `${route.path}\u0000${JSON.stringify(route.query.toJSON())}\u0000${route.hash ?? ''}`;
}

let currentRouteSnapshot = buildRouteSnapshot('/', '', '');

const currentRouteSource = createSource();

/** Register a callback to run whenever the active route changes, with optional cleanup. */
export function onRouteChange(
  fn: (
    current: RouteSnapshot,
    previous: RouteSnapshot | null
  ) => RouteChangeCleanup,
  options: RouteChangeOptions = {}
): void {
  const instance = getCurrentComponentInstance();
  if (!instance) return;
  const route = currentRoute();
  const slot = hookSlot<RouteChangeSlot>(instance, 'onRouteChange', () => ({
    kind: 'route-change',
    previous: null,
    cleanup: null,
    cleanupRegistered: false,
  }));
  const immediate = options.immediate === true;
  if (!slot.cleanupRegistered) {
    instance.onCleanup(() => {
      slot.cleanup?.();
      slot.cleanup = null;
    });
    slot.cleanupRegistered = true;
  }
  onCommit(instance, () => {
    const previous = slot.previous;
    if (!previous) {
      if (immediate) slot.cleanup = fn(route, null) ?? null;
      slot.previous = route;
      return;
    }
    if (routeSignature(previous) === routeSignature(route)) return;
    slot.cleanup?.();
    slot.cleanup = fn(route, previous) ?? null;
    slot.previous = route;
  });
}

let serverLocation: string | null = null;

function readLocationState(): { hasState: boolean; state: unknown } {
  if (getActiveRenderContext()?.mode === 'ssr') {
    return { hasState: false, state: undefined };
  }
  const staged = getStagedAppRenderRouteState(getCurrentAppRenderRuntime());
  if (staged) return staged;
  const historyState =
    typeof window !== 'undefined' && window.history?.state
      ? window.history.state
      : null;
  const hasState = historyState?.askrHasState === true;

  return {
    hasState,
    state: hasState ? historyState.askrState : undefined,
  };
}

function logicalRoutePathname(pathname: string): string | undefined {
  const logical = removeRouteBasePath(pathname, getActiveRouteBasePath());
  return logical === undefined ? undefined : parseLocation(logical).pathname;
}

function routePathname(pathname: string): {
  pathname: string;
  withinBasePath: boolean;
} {
  const logical = logicalRoutePathname(pathname);
  return logical === undefined
    ? { pathname: parseLocation(pathname).pathname, withinBasePath: false }
    : { pathname: logical, withinBasePath: true };
}

export function setServerLocation(url: string | null): void {
  serverLocation = url;
  if (url) {
    const parsed = parseLocation(url);
    const location = routePathname(parsed.pathname);
    syncRouteActivitySnapshot(
      location.pathname,
      location.withinBasePath
        ? computeMatchesFromRoutes(location.pathname, getActiveRoutes()).slice(
            -1
          )
        : []
    );
    return;
  }

  syncRouteActivitySnapshot(
    currentRouteSnapshot.path,
    currentRouteSnapshot.matches.slice(-1)
  );
}

/** The query string parsed with the leaf match's `search` schema, if it has one. */
function parsedRouteSearch(
  matches: readonly RouteMatch[],
  search: string
): Readonly<RouteSearch> {
  const leaf = matches[matches.length - 1];
  const schema = leaf
    ? (
        getActiveRoutes().find((entry) => entry.path === leaf.path) as
          | InternalRoute
          | undefined
      )?.searchSchema
    : undefined;
  return schema ? parseRouteSearch(schema, search) : emptyRouteSearch();
}

function buildRouteSnapshot(
  pathname: string,
  search: string,
  hash: string
): RouteSnapshot {
  const location = routePathname(pathname);
  pathname = location.pathname;
  const query = makeQuery(search);
  const matches = location.withinBasePath
    ? computeMatchesFromRoutes(pathname, getActiveRoutes())
    : [];
  const locationState = readLocationState();

  return Object.freeze({
    path: pathname,
    params: deepFreeze({ ...matches[matches.length - 1]?.params }),
    query,
    search: parsedRouteSearch(matches, search),
    hash: hash || null,
    ...locationState,
    matches: Object.freeze(matches),
  });
}

function setCurrentRouteSnapshot(
  pathname: string,
  search: string,
  hash: string,
  activityMatches?: readonly RouteMatch[]
): void {
  currentRouteSnapshot = buildRouteSnapshot(pathname, search, hash);
  syncRouteActivitySnapshot(
    currentRouteSnapshot.path,
    activityMatches ?? currentRouteSnapshot.matches.slice(-1)
  );

  notify(currentRouteSource);
}

function normalizeRouteActivityPath(path: string): string {
  const parsed = parseLocation(path);
  const pathname = parsed.pathname || '/';
  const absolutePathname = pathname.startsWith('/') ? pathname : `/${pathname}`;
  return absolutePathname.endsWith('/') && absolutePathname !== '/'
    ? absolutePathname.slice(0, -1)
    : absolutePathname;
}

function readCurrentRouteLocation(): {
  pathname: string;
  search: string;
  hash: string;
  withinBasePath: boolean;
} {
  const renderContext = getActiveRenderContext();
  if (renderContext?.url) {
    const parsed = parseLocation(renderContext.url);
    const location = routePathname(parsed.pathname);
    return {
      ...parsed,
      ...location,
    };
  }

  const stagedRouteLocation = getStagedAppRenderRouteLocation(
    getCurrentAppRenderRuntime()
  );
  if (stagedRouteLocation) {
    const parsed = parseLocation(stagedRouteLocation);
    const location = routePathname(parsed.pathname);
    return {
      ...parsed,
      ...location,
    };
  }

  if (typeof window !== 'undefined' && window.location) {
    const location = routePathname(window.location.pathname || '/');
    return {
      ...location,
      search: window.location.search || '',
      hash: window.location.hash || '',
    };
  }

  if (serverLocation) {
    const parsed = parseLocation(serverLocation);
    const location = routePathname(parsed.pathname);
    return {
      ...parsed,
      ...location,
    };
  }

  const location = routePathname(currentRouteSnapshot.path);
  return {
    ...location,
    search: '',
    hash: currentRouteSnapshot.hash ?? '',
  };
}

export function isRoutePathActive(
  pathOrPaths: string | readonly string[]
): boolean {
  // A registry with `caseSensitive: false` or a `trailingSlash` policy
  // compares paths in the canonical form resolution serves them under.
  const policy = getRoutePathPolicy(getActiveRoutes());
  const canonical = (path: string): string => {
    const normalized = normalizeRouteActivityPath(path);
    return policy
      ? normalizeRouteActivityPath(canonicalMatchPath(normalized, policy))
      : normalized;
  };
  const candidates = new Set(
    (Array.isArray(pathOrPaths) ? pathOrPaths : [pathOrPaths]).map(canonical)
  );

  const location = readCurrentRouteLocation();
  if (!location.withinBasePath) return false;
  const activePath = canonical(location.pathname);
  if (candidates.has(activePath)) {
    return true;
  }

  const matches = computeMatchesFromRoutes(activePath, getActiveRoutes());
  return matches
    .slice(-1)
    .some((match) => candidates.has(canonical(match.path)));
}

function readCurrentRouteSnapshot<
  TParams extends RouteParams = RouteParams,
  TState = unknown,
  TAppMeta = unknown,
  TSearch = RouteSearch,
>(): RouteSnapshot<TParams, TState, TAppMeta, TSearch> {
  const instance = getCurrentComponentInstance();
  if (!instance) {
    throw new Error(
      'currentRoute() can only be called during component render execution. ' +
        'Call currentRoute() from inside your component function.'
    );
  }

  const { pathname, search, hash, withinBasePath } = readCurrentRouteLocation();
  const contextParams = withinBasePath
    ? getActiveRenderContext()?.params
    : undefined;
  const locationState = readLocationState();
  const version = getRouteTableVersion();
  // Each mounted app reads its own registry; the memo is per route list.
  const routes = getActiveRoutes();
  const memo = readSnapshotMemo;
  if (
    memo &&
    memo.routes === routes &&
    memo.pathname === pathname &&
    memo.search === search &&
    memo.hash === hash &&
    memo.withinBasePath === withinBasePath &&
    memo.contextParams === contextParams &&
    memo.hasState === locationState.hasState &&
    memo.state === locationState.state &&
    memo.version === version
  ) {
    return memo.snapshot as RouteSnapshot<TParams, TState, TAppMeta, TSearch>;
  }

  const query = makeQuery(search);
  const matches = withinBasePath
    ? computeMatchesFromRoutes(pathname, routes)
    : [];
  const routeParams =
    contextParams ?? matches[matches.length - 1]?.params ?? {};
  const params = deepFreeze({
    ...routeParams,
  });

  const parsedSearch = parsedRouteSearch(matches, search);

  const snapshot = Object.freeze({
    path: pathname,
    params,
    query,
    search: parsedSearch,
    hash: hash || null,
    ...locationState,
    matches: Object.freeze(matches),
  }) as RouteSnapshot;
  readSnapshotMemo = {
    routes,
    pathname,
    search,
    hash,
    withinBasePath,
    contextParams,
    hasState: locationState.hasState,
    state: locationState.state,
    version,
    snapshot,
  };
  return snapshot as RouteSnapshot<TParams, TState, TAppMeta, TSearch>;
}

/**
 * One snapshot object per committed location: repeated `currentRoute()`
 * reads compare by identity and skip re-matching the URL. Any input that
 * could change the snapshot invalidates it.
 */
let readSnapshotMemo: {
  routes: readonly Route[];
  pathname: string;
  search: string;
  hash: string;
  withinBasePath: boolean;
  contextParams: Record<string, string> | undefined;
  hasState: boolean;
  state: unknown;
  version: number;
  snapshot: RouteSnapshot;
} | null = null;

/** Read the currently active route's {@link RouteSnapshot}; reactive during component render. */
export function currentRoute<
  TParams extends RouteParams = RouteParams,
  TState = unknown,
  TAppMeta = unknown,
  TSearch = RouteSearch,
>(): RouteSnapshot<TParams, TState, TAppMeta, TSearch> {
  const instance = getCurrentComponentInstance();
  if (!instance) {
    throw new Error(
      'currentRoute() can only be called during component render execution. ' +
        'Call currentRoute() from inside your component function.'
    );
  }

  if (typeof window === 'undefined' || instance.server) {
    return readCurrentRouteSnapshot<TParams, TState, TAppMeta, TSearch>();
  }

  readSource(currentRouteSource);
  return readCurrentRouteSnapshot<TParams, TState, TAppMeta, TSearch>();
}

export function syncCurrentRouteSnapshot(
  pathname: string,
  search: string,
  hash: string,
  activityMatches?: readonly RouteMatch[]
): void {
  setCurrentRouteSnapshot(pathname, search, hash, activityMatches);
}

/** @internal Return route activity to its initial location. Part of the router-wide reset. */
export function resetRouteActivity(): void {
  serverLocation = null;
  currentRouteSnapshot = buildRouteSnapshot('/', '', '');
}
