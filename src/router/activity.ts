import type { RouteMatch, RouteParams, RouteSnapshot } from '../common/router';
import { syncRouteActivitySnapshot } from '../common/route-activity';
import { getActiveRenderContext } from '../common/render-context';
import { getCurrentComponentInstance } from '../runtime';
import {
  markReadableDerivedSubscribersDirty,
  markReactivePropsDirtySource,
  notifyReadableReaders,
  recordReadableRead,
  type ReadableSource,
} from '../runtime';
import { deepFreeze, makeQuery, parseLocation } from './route-context';
import { computeMatchesFromRoutes } from './resolution';
import { getActiveRoutes } from './store';

let currentRouteSnapshot = buildRouteSnapshot('/', '', '');

const currentRouteSource = (() =>
  currentRouteSnapshot) as ReadableSource<RouteSnapshot> &
  (() => RouteSnapshot);

currentRouteSource._readers = new Map();

let serverLocation: string | null = null;

export function setServerLocation(url: string | null): void {
  serverLocation = url;
  if (url) {
    const parsed = parseLocation(url);
    syncRouteActivitySnapshot(
      parsed.pathname,
      computeMatchesFromRoutes(parsed.pathname, getActiveRoutes())
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
  const query = makeQuery(search);
  const matches = computeMatchesFromRoutes(pathname, getActiveRoutes());

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
    pathname,
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
} {
  const renderContext = getActiveRenderContext();
  if (renderContext?.url) {
    return parseLocation(renderContext.url);
  }

  if (typeof window !== 'undefined' && window.location) {
    return {
      pathname: window.location.pathname || '/',
      search: window.location.search || '',
      hash: window.location.hash || '',
    };
  }

  if (serverLocation) {
    return parseLocation(serverLocation);
  }

  return {
    pathname: currentRouteSnapshot.path,
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

  const activePath = normalizeRouteActivityPath(
    readCurrentRouteLocation().pathname
  );
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

  const { pathname, search, hash } = readCurrentRouteLocation();

  const query = makeQuery(search);
  const matches = computeMatchesFromRoutes(pathname, getActiveRoutes());
  const routeParams =
    getActiveRenderContext()?.params ?? matches[0]?.params ?? {};
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
