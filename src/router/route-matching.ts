import type {
  Route,
  RouteMatch,
  RouteRecord,
  RouteRegistry,
  ResolvedRoute,
} from '../common/router';
import { deepFreeze, parseLocation } from './route-context';
import {
  computeRank,
  matchSegments,
  parseSegments,
  splitPathSegments,
} from './match';
import type { InternalRoute, InternalRouteRecord } from './internal-types';
import { getRouteRecords, isRouteStoreRoutes } from './store';

const routeSegsCache = new WeakMap<Route, ReturnType<typeof parseSegments>>();
const routeRankCache = new WeakMap<Route, number>();
const sortedListCache = new WeakMap<
  ReadonlyArray<Route>,
  ReadonlyArray<Route>
>();

function cachedSegs(route: Route): ReturnType<typeof parseSegments> {
  let segments = routeSegsCache.get(route);
  if (!segments) {
    segments = parseSegments(route.path);
    routeSegsCache.set(route, segments);
  }
  return segments;
}

function cachedRank(route: Route): number {
  let rank = routeRankCache.get(route);
  if (rank === undefined) {
    rank = computeRank(cachedSegs(route));
    routeRankCache.set(route, rank);
  }
  return rank;
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

function matchFallbackPrefix(
  pathname: string,
  fallbackPrefix: string
): Record<string, string> | null {
  const normalizedPath =
    pathname.endsWith('/') && pathname !== '/'
      ? pathname.slice(0, -1)
      : pathname;
  const normalizedPrefix =
    fallbackPrefix.endsWith('/') && fallbackPrefix !== '/'
      ? fallbackPrefix.slice(0, -1)
      : fallbackPrefix;

  if (normalizedPrefix === '/') {
    const urlParts = splitPathSegments(normalizedPath);
    return {
      '*':
        urlParts.length === 0
          ? '/'
          : urlParts.length === 1
            ? urlParts[0]
            : '/' + urlParts.join('/'),
    };
  }

  if (
    normalizedPath !== normalizedPrefix &&
    !normalizedPath.startsWith(`${normalizedPrefix}/`)
  ) {
    return null;
  }

  const remainder =
    normalizedPath === normalizedPrefix
      ? '/'
      : normalizedPath.slice(normalizedPrefix.length);
  const remainderParts = splitPathSegments(remainder);

  return {
    '*':
      remainderParts.length === 0
        ? '/'
        : remainderParts.length === 1
          ? remainderParts[0]
          : '/' + remainderParts.join('/'),
  };
}

function findBestResolvedRouteFromRoutes(
  pathname: string,
  routeList: readonly Route[]
): { route: Route; params: Record<string, string> } | null {
  const normalized =
    pathname.endsWith('/') && pathname !== '/'
      ? pathname.slice(0, -1)
      : pathname;
  const urlParts = splitPathSegments(normalized);

  const sorted = cachedSortedList(routeList);
  let bestRoute: Route | null = null;
  let bestParams: Record<string, string> = {};
  let bestRank = -Infinity;

  for (const route of sorted) {
    const internalRoute = route as InternalRoute;
    if (internalRoute.fallbackPrefix) {
      continue;
    }

    const rank = cachedRank(route);
    if (rank < bestRank) break;
    if (bestRoute !== null && rank === bestRank) continue;

    const params = matchSegments(urlParts, cachedSegs(route));
    if (params !== null) {
      bestRoute = route;
      bestParams = params;
      bestRank = rank;
    }
  }

  if (bestRoute !== null) {
    return { route: bestRoute, params: bestParams };
  }

  let bestFallback: InternalRoute | null = null;
  let bestFallbackParams: Record<string, string> | null = null;
  let bestPrefixLength = -1;

  for (const route of routeList) {
    const internalRoute = route as InternalRoute;
    if (!internalRoute.fallbackPrefix) {
      continue;
    }

    const params = matchFallbackPrefix(
      normalized,
      internalRoute.fallbackPrefix
    );
    if (params === null) {
      continue;
    }

    if (internalRoute.fallbackPrefix.length > bestPrefixLength) {
      bestFallback = internalRoute;
      bestFallbackParams = params;
      bestPrefixLength = internalRoute.fallbackPrefix.length;
    }
  }

  return bestFallback && bestFallbackParams
    ? { route: bestFallback, params: bestFallbackParams }
    : null;
}

function findBestScopedFallbackRecord(
  pathname: string,
  routeRecords: readonly RouteRecord[]
): { record: InternalRouteRecord; params: Record<string, string> } | null {
  let bestRecord: InternalRouteRecord | null = null;
  let bestParams: Record<string, string> | null = null;
  let bestPrefixLength = -1;

  for (const routeRecord of routeRecords) {
    const record = routeRecord as InternalRouteRecord;
    if (!record.fallbackPrefix) {
      continue;
    }

    const params = matchFallbackPrefix(pathname, record.fallbackPrefix);
    if (params === null) {
      continue;
    }

    if (record.fallbackPrefix.length > bestPrefixLength) {
      bestRecord = record;
      bestParams = params;
      bestPrefixLength = record.fallbackPrefix.length;
    }
  }

  return bestRecord && bestParams
    ? { record: bestRecord, params: bestParams }
    : null;
}

export function getMatchingRouteRecord(
  target: string,
  routeRecords: readonly RouteRecord[]
): { record: RouteRecord; params: Record<string, string> } | null {
  const location = parseLocation(target);
  const normalized =
    location.pathname.endsWith('/') && location.pathname !== '/'
      ? location.pathname.slice(0, -1)
      : location.pathname;
  const urlParts = splitPathSegments(normalized);

  for (const record of routeRecords) {
    const internalRecord = record as InternalRouteRecord;
    if (internalRecord.fallbackPrefix) {
      continue;
    }

    const params = matchSegments(urlParts, record.segments);
    if (params !== null) {
      return { record, params };
    }
  }

  return findBestScopedFallbackRecord(normalized, routeRecords);
}

export function computeMatchesFromRoutes(
  pathname: string,
  routesList: readonly Route[]
): RouteMatch[] {
  const bestMatch = isRouteStoreRoutes(routesList)
    ? getMatchingRouteRecord(pathname, getRouteRecords())
    : findBestResolvedRouteFromRoutes(pathname, routesList);

  if (!bestMatch) {
    return [];
  }

  return [
    {
      path: 'route' in bestMatch ? bestMatch.route.path : bestMatch.record.path,
      params: deepFreeze({ ...bestMatch.params }),
      name:
        'route' in bestMatch
          ? (bestMatch.route as { name?: string }).name
          : undefined,
      namespace:
        'route' in bestMatch
          ? bestMatch.route.namespace
          : bestMatch.record.options.namespace,
    },
  ];
}

export function computeMatchesFromRouteRecords(
  pathname: string,
  routeRecords: readonly RouteRecord[]
): RouteMatch[] {
  const bestMatch = getMatchingRouteRecord(pathname, routeRecords);

  if (!bestMatch) {
    return [];
  }

  return [
    {
      path: bestMatch.record.path,
      params: deepFreeze({ ...bestMatch.params }),
      namespace: bestMatch.record.options.namespace,
    },
  ];
}

export function computeRouteActivityMatches(
  pathname: string,
  options: { registry: RouteRegistry }
): RouteMatch[] {
  return computeMatchesFromRouteRecords(
    pathname,
    options.registry.manifest.records
  );
}

export function resolveRoute(pathname: string): ResolvedRoute | null {
  const normalized =
    pathname.endsWith('/') && pathname !== '/'
      ? pathname.slice(0, -1)
      : pathname;
  const urlParts = splitPathSegments(normalized);
  const records = getRouteRecords();

  for (const record of records) {
    if (record.fallbackPrefix) {
      continue;
    }

    const params = matchSegments(urlParts, record.segments);
    if (params !== null) {
      return { handler: record.handler, params };
    }
  }

  const fallbackMatch = findBestScopedFallbackRecord(normalized, records);
  return fallbackMatch
    ? { handler: fallbackMatch.record.handler, params: fallbackMatch.params }
    : null;
}

export function resolveRouteFromRoutes(
  pathname: string,
  routeList: readonly Route[]
): ResolvedRoute | null {
  if (isRouteStoreRoutes(routeList)) return resolveRoute(pathname);

  const match = findBestResolvedRouteFromRoutes(pathname, routeList);
  return match ? { handler: match.route.handler, params: match.params } : null;
}

export function _resolveRouteMatchFromRoutes(
  pathname: string,
  routeList: readonly Route[]
): { route: Route; params: Record<string, string> } | null {
  return findBestResolvedRouteFromRoutes(pathname, routeList);
}
