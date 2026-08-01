import type { RouteMatch, RouteParams, RouteSnapshot } from '../common/router';
import { getStagedAppRenderRouteLocation } from '../common/app-render-runtime';
import { syncRouteActivitySnapshot } from '../common/route-activity';
import { getActiveRenderContext } from '../common/render-context';
import {
  getCurrentAppRenderRuntime,
  getCurrentComponentInstance,
  claimHookIndex,
  registerCommitOperation,
} from '../runtime';
import {
  markReadableDerivedSubscribersDirty,
  markReactivePropsDirtySource,
  notifyReadableReaders,
  recordReadableRead,
  type ReadableSource,
} from '../runtime';
import { deepFreeze, makeQuery, parseLocation } from './route-context';
import { computeMatchesFromRoutes } from './route-matching';
import { getActiveRouteBasePath, getActiveRoutes } from './store';
import { removeRouteBasePath } from './base-path';

export interface RouteChangeOptions {
  immediate?: boolean;
}
export type RouteChangeCleanup = void | (() => void);
type RouteChangeSlot = {
  kind: 'route-change';
  previous: RouteSnapshot | null;
  pending: RouteSnapshot | null;
  cleanup: (() => void) | null;
  cleanupRegistered: boolean;
  callback: (
    current: RouteSnapshot,
    previous: RouteSnapshot | null
  ) => RouteChangeCleanup;
  immediate: boolean;
};
function routeSignature(route: RouteSnapshot): string {
  return `${route.path}\u0000${JSON.stringify(route.query.toJSON())}\u0000${route.hash ?? ''}`;
}

let currentRouteSnapshot = buildRouteSnapshot('/', '', '');

const currentRouteSource = (() =>
  currentRouteSnapshot) as ReadableSource<RouteSnapshot> &
  (() => RouteSnapshot);

currentRouteSource._readers = new Map();

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
  const index = claimHookIndex(instance, 'route-change');
  const slots = (instance.lifecycleSlots ??= []);
  const existing = slots[index] as { kind: string } | undefined;
  if (existing && existing.kind !== 'route-change') {
    throw new Error(
      `onRouteChange() lifecycle order violation: slot ${index} already belongs to ${existing.kind}(). ` +
        'Keep lifecycle primitives in a stable top-level order.'
    );
  }
  const slot = (existing ?? {
    kind: 'route-change',
    previous: null,
    pending: null,
    cleanup: null,
    cleanupRegistered: false,
    callback: fn,
    immediate: options.immediate === true,
  }) as RouteChangeSlot;
  slots[index] = slot as never;
  slot.pending = route;
  slot.callback = fn;
  slot.immediate = options.immediate === true;
  if (!slot.cleanupRegistered) {
    instance.cleanupFns ??= [];
    instance.cleanupFns.push(() => {
      slot.cleanup?.();
      slot.cleanup = null;
    });
    slot.cleanupRegistered = true;
  }
  if (!slot.previous) {
    registerCommitOperation(() => {
      const committed = slot.pending;
      if (!committed) return;
      if (slot.immediate) slot.cleanup = slot.callback(committed, null) ?? null;
      slot.previous = committed;
    });
    return;
  }
  if (routeSignature(slot.previous) === routeSignature(route)) return;
  registerCommitOperation(() => {
    const previous = slot.previous;
    const committed = slot.pending;
    if (
      !previous ||
      !committed ||
      routeSignature(previous) === routeSignature(committed)
    )
      return;
    slot.cleanup?.();
    slot.cleanup = slot.callback(committed, previous) ?? null;
    slot.previous = committed;
  });
}

let serverLocation: string | null = null;

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
        ? computeMatchesFromRoutes(location.pathname, getActiveRoutes())
        : []
    );
    return;
  }

  syncRouteActivitySnapshot(
    currentRouteSnapshot.path,
    currentRouteSnapshot.matches
  );
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

  return Object.freeze({
    path: pathname,
    params: deepFreeze({ ...matches[0]?.params }),
    query,
    hash: hash || null,
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
    activityMatches ?? currentRouteSnapshot.matches
  );

  const instance = getCurrentComponentInstance();
  markReadableDerivedSubscribersDirty(currentRouteSource);
  markReactivePropsDirtySource(currentRouteSource);
  notifyReadableReaders(currentRouteSource, instance);
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
  const candidates = new Set(
    (Array.isArray(pathOrPaths) ? pathOrPaths : [pathOrPaths]).map(
      normalizeRouteActivityPath
    )
  );

  const location = readCurrentRouteLocation();
  if (!location.withinBasePath) return false;
  const activePath = normalizeRouteActivityPath(location.pathname);
  if (candidates.has(activePath)) {
    return true;
  }

  const matches = computeMatchesFromRoutes(activePath, getActiveRoutes());
  return matches.some((match) =>
    candidates.has(normalizeRouteActivityPath(match.path))
  );
}

function readCurrentRouteSnapshot<
  TParams extends RouteParams = RouteParams,
>(): RouteSnapshot<TParams> {
  const instance = getCurrentComponentInstance();
  if (!instance) {
    throw new Error(
      'currentRoute() can only be called during component render execution. ' +
        'Call currentRoute() from inside your component function.'
    );
  }

  const { pathname, search, hash, withinBasePath } =
    readCurrentRouteLocation();

  const query = makeQuery(search);
  const matches = withinBasePath
    ? computeMatchesFromRoutes(pathname, getActiveRoutes())
    : [];
  const routeParams =
    (withinBasePath ? getActiveRenderContext()?.params : undefined) ??
    matches[0]?.params ??
    {};
  const params = deepFreeze({
    ...routeParams,
  });

  return Object.freeze({
    path: pathname,
    params,
    query,
    hash: hash || null,
    matches: Object.freeze(matches),
  }) as RouteSnapshot<TParams>;
}

export function currentRoute<
  TParams extends RouteParams = RouteParams,
>(): RouteSnapshot<TParams> {
  const instance = getCurrentComponentInstance();
  if (!instance) {
    throw new Error(
      'currentRoute() can only be called during component render execution. ' +
        'Call currentRoute() from inside your component function.'
    );
  }

  if (typeof window === 'undefined' || instance.ssr) {
    return readCurrentRouteSnapshot<TParams>();
  }

  recordReadableRead(currentRouteSource);
  return readCurrentRouteSnapshot<TParams>();
}

export function syncCurrentRouteSnapshot(
  pathname: string,
  search: string,
  hash: string,
  activityMatches?: readonly RouteMatch[]
): void {
  setCurrentRouteSnapshot(pathname, search, hash, activityMatches);
}
