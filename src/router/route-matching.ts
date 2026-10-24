import type {
  ParsedSegment,
  Route,
  RouteManifest,
  RouteMatch,
  RouteRecord,
  RouteRegistry,
  RouteParams,
  ResolvedRoute,
} from '../common/router';
import { normalizeRouteBasePath, removeRouteBasePath } from './base-path';
import { deepFreeze, parseLocation } from './route-context';
import {
  compareRouteSpecificity,
  formatCatchAllCapture,
  matchSegments,
  parseSegments,
  splitPathSegments,
} from './match';
import type { InternalRoute, InternalRouteRecord } from './internal-types';
import {
  getRoutePathPolicy,
  getRouteRecords,
  getRouteTableVersion,
  isRouteStoreRoutes,
} from './store';
import { canonicalPathname } from './path-canonicalization';
import { decodePathSegment } from './match';

/**
 * Entries grouped by their first segment so a match consults only the
 * routes that can start the way the URL does. Each bucket keeps the
 * specificity order of the entry list, and the two candidate lists are
 * merged in that order, so the first match is the same one a scan of the
 * whole list would return. The last answer is memoized because one
 * navigation matches the same URL several times.
 */
interface MatchIndex<T extends { fallbackPrefix?: string }> {
  readonly version: number;
  readonly length: number;
  readonly staticFirst: Map<string, T[]>;
  /** Root entries and entries whose first segment is not static. */
  readonly otherFirst: T[];
  readonly fallbacks: T[];
  readonly order: Map<T, number>;
  memoPath: string | null;
  memoResult: { entry: T; params: Record<string, string> } | null;
}

type SegmentsOf<T> = (entry: T) => ParsedSegment[];

function buildMatchIndex<T extends { fallbackPrefix?: string }>(
  entries: readonly T[],
  segmentsOf: SegmentsOf<T>,
  version: number
): MatchIndex<T> {
  const staticFirst = new Map<string, T[]>();
  const otherFirst: T[] = [];
  const fallbacks: T[] = [];
  const order = new Map<T, number>();
  for (let position = 0; position < entries.length; position++) {
    const entry = entries[position];
    order.set(entry, position);
    if (entry.fallbackPrefix) {
      fallbacks.push(entry);
      continue;
    }
    const first = segmentsOf(entry)[0];
    if (first && first.kind === 'static') {
      const key = decodePathSegment(first.value);
      const bucket = staticFirst.get(key);
      if (bucket) bucket.push(entry);
      else staticFirst.set(key, [entry]);
    } else {
      otherFirst.push(entry);
    }
  }
  return {
    version,
    length: entries.length,
    staticFirst,
    otherFirst,
    fallbacks,
    order,
    memoPath: null,
    memoResult: null,
  };
}

const NO_ENTRIES: readonly never[] = [];

function matchIndexed<T extends { fallbackPrefix?: string }>(
  index: MatchIndex<T>,
  pathname: string,
  segmentsOf: SegmentsOf<T>
): { entry: T; params: Record<string, string> } | null {
  if (index.memoPath === pathname) return index.memoResult;
  const urlParts = splitPathSegments(pathname);
  const statics: readonly T[] =
    urlParts.length > 0
      ? (index.staticFirst.get(decodePathSegment(urlParts[0])) ?? NO_ENTRIES)
      : NO_ENTRIES;
  const others = index.otherFirst;
  let result: { entry: T; params: Record<string, string> } | null = null;
  let i = 0;
  let j = 0;
  while (i < statics.length || j < others.length) {
    const entry =
      j >= others.length ||
      (i < statics.length &&
        index.order.get(statics[i])! < index.order.get(others[j])!)
        ? statics[i++]
        : others[j++];
    const params = matchSegments(urlParts, segmentsOf(entry));
    if (params !== null) {
      result = { entry, params };
      break;
    }
  }
  if (!result) {
    const normalized =
      pathname.endsWith('/') && pathname !== '/'
        ? pathname.slice(0, -1)
        : pathname;
    result = findDeepestFallback(normalized, index.fallbacks);
  }
  index.memoPath = pathname;
  index.memoResult = result;
  return result;
}

const recordSegments: SegmentsOf<InternalRouteRecord> = (record) =>
  record.segments;
const recordIndexes = new WeakMap<
  readonly RouteRecord[],
  MatchIndex<InternalRouteRecord>
>();

function recordIndexFor(
  records: readonly RouteRecord[]
): MatchIndex<InternalRouteRecord> {
  const version = records === getRouteRecords() ? getRouteTableVersion() : 0;
  let index = recordIndexes.get(records);
  if (!index || index.version !== version || index.length !== records.length) {
    index = buildMatchIndex(
      records as readonly InternalRouteRecord[],
      recordSegments,
      version
    );
    recordIndexes.set(records, index);
  }
  return index;
}

function matchIndexedRecords(
  pathname: string,
  records: readonly RouteRecord[]
): { record: RouteRecord; params: Record<string, string> } | null {
  const match = matchIndexed(recordIndexFor(records), pathname, recordSegments);
  return match ? { record: match.entry, params: match.params } : null;
}

const routeIndexes = new WeakMap<readonly Route[], MatchIndex<InternalRoute>>();

function routeIndexFor(sorted: readonly Route[]): MatchIndex<InternalRoute> {
  let index = routeIndexes.get(sorted);
  if (!index) {
    index = buildMatchIndex(sorted as readonly InternalRoute[], cachedSegs, 0);
    routeIndexes.set(sorted, index);
  }
  return index;
}

const routeSegsCache = new WeakMap<Route, ReturnType<typeof parseSegments>>();
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

function cachedSortedList(
  routeList: ReadonlyArray<Route>
): ReadonlyArray<Route> {
  let sorted = sortedListCache.get(routeList);
  if (!sorted) {
    // Array#sort is stable, so declaration order breaks specificity ties.
    sorted = [...routeList].sort((a, b) =>
      compareRouteSpecificity(cachedSegs(a), cachedSegs(b))
    );
    sortedListCache.set(routeList, sorted);
  }
  return sorted;
}

const prefixSegsCache = new Map<string, ReturnType<typeof parseSegments>>();

function cachedPrefixSegs(prefix: string): ReturnType<typeof parseSegments> {
  let segments = prefixSegsCache.get(prefix);
  if (!segments) {
    segments = parseSegments(prefix);
    prefixSegsCache.set(prefix, segments);
  }
  return segments;
}

/**
 * Match a scoped fallback's page prefix against the start of `pathname`.
 * Prefix segments match like route segments, so a fallback inside
 * `page('/{lang}')` matches `/en/...` and captures `lang`; the rest of the
 * path is the `*` capture.
 */
function matchFallbackPrefix(
  pathname: string,
  fallbackPrefix: string
): Record<string, string> | null {
  const urlParts = splitPathSegments(pathname);
  const prefixSegments = cachedPrefixSegs(fallbackPrefix);
  if (urlParts.length < prefixSegments.length) {
    return null;
  }

  const prefixParams = matchSegments(
    urlParts.slice(0, prefixSegments.length),
    prefixSegments
  );
  if (prefixParams === null) {
    return null;
  }

  return {
    ...prefixParams,
    '*': formatCatchAllCapture(urlParts.slice(prefixSegments.length)),
  };
}

function findBestResolvedRouteFromRoutes(
  pathname: string,
  routeList: readonly Route[]
): { route: Route; params: Record<string, string> } | null {
  // Sorted most specific first, so the first match is the best match.
  const match = matchIndexed(
    routeIndexFor(cachedSortedList(routeList)),
    pathname,
    cachedSegs
  );
  return match ? { route: match.entry, params: match.params } : null;
}

/**
 * Pick the scoped fallback whose prefix matches `pathname` with the most
 * segments. Depth is counted in segments, not characters, so an encoded prefix
 * such as `/caf%C3%A9` does not outrank a deeper `/café/x`; equal depths are
 * ordered by segment specificity.
 */
function findDeepestFallback<T extends { fallbackPrefix?: string }>(
  pathname: string,
  entries: readonly T[]
): { entry: T; params: Record<string, string> } | null {
  let best: { entry: T; params: Record<string, string> } | null = null;
  let bestSegments: ReturnType<typeof parseSegments> = [];

  for (const entry of entries) {
    if (!entry.fallbackPrefix) {
      continue;
    }

    const params = matchFallbackPrefix(pathname, entry.fallbackPrefix);
    if (params === null) {
      continue;
    }

    // Deeper prefixes win; at equal depth the more specific prefix does
    // (`/en/blog` over `/{lang}/blog`).
    const segments = cachedPrefixSegs(entry.fallbackPrefix);
    if (
      best === null ||
      segments.length > bestSegments.length ||
      (segments.length === bestSegments.length &&
        compareRouteSpecificity(segments, bestSegments) < 0)
    ) {
      best = { entry, params };
      bestSegments = segments;
    }
  }

  return best;
}

function findBestScopedFallbackRecord(
  pathname: string,
  routeRecords: readonly RouteRecord[]
): { record: InternalRouteRecord; params: Record<string, string> } | null {
  const fallback = findDeepestFallback(
    pathname,
    routeRecords as readonly InternalRouteRecord[]
  );
  return fallback ? { record: fallback.entry, params: fallback.params } : null;
}

export function getMatchingRouteRecord(
  target: string,
  routeRecords: readonly RouteRecord[]
): { record: RouteRecord; params: Record<string, string> } | null {
  const location = parseLocation(target);
  return matchIndexedRecords(location.pathname, routeRecords);
}

/**
 * The pathname resolution would serve `pathname` under: a registry with
 * `trailingSlash` or `caseSensitive: false` redirects to this canonical form
 * and matches it, so reads that never resolve (matching, activity, route
 * snapshots) match it directly.
 */
export function canonicalMatchPath(
  pathname: string,
  manifest: RouteManifest
): string {
  return canonicalPathname(parseLocation(pathname).pathname, manifest, (path) =>
    matchIndexedRecords(path, manifest.records)
  );
}

/** Match `target` the way resolution does under the manifest's path policy. */
export function getMatchingRouteRecordUnderPolicy(
  target: string,
  manifest: RouteManifest
): { record: RouteRecord; params: Record<string, string> } | null {
  const location = parseLocation(target);
  return matchIndexedRecords(
    canonicalMatchPath(location.pathname, manifest),
    manifest.records
  );
}

export function computeMatchesFromRoutes(
  pathname: string,
  routesList: readonly Route[]
): RouteMatch[] {
  const policy = getRoutePathPolicy(routesList);
  if (policy) pathname = canonicalMatchPath(pathname, policy);
  const bestMatch = isRouteStoreRoutes(routesList)
    ? getMatchingRouteRecord(pathname, getRouteRecords())
    : findBestResolvedRouteFromRoutes(pathname, routesList);

  if (!bestMatch) {
    return [];
  }

  const owner =
    'route' in bestMatch
      ? (bestMatch.route as InternalRoute)
      : (bestMatch.record as InternalRouteRecord);
  return withAppMetaMatches(owner, {
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
  });
}

function withAppMetaMatches(
  owner: InternalRoute | InternalRouteRecord,
  leaf: RouteMatch
): RouteMatch[] {
  const chain = owner.appMetaChain;
  if (!chain?.length) return [leaf];
  const appMeta = chain[chain.length - 1].appMeta;
  const metadataLeaf = appMeta === undefined ? leaf : { ...leaf, appMeta };
  const ancestors = chain.slice(0, -1).map((entry) =>
    Object.freeze({
      path: entry.path,
      params: leaf.params,
      appMeta: entry.appMeta,
    })
  );
  return [...ancestors, Object.freeze(metadataLeaf)];
}

export function computeMatchesFromRouteRecords(
  pathname: string,
  routeRecords: readonly RouteRecord[]
): RouteMatch[] {
  const bestMatch = getMatchingRouteRecord(pathname, routeRecords);

  if (!bestMatch) {
    return [];
  }

  return withAppMetaMatches(bestMatch.record as InternalRouteRecord, {
    path: bestMatch.record.path,
    params: deepFreeze({ ...bestMatch.params }),
    namespace: bestMatch.record.options.namespace,
  });
}

export function computeRouteActivityMatches(
  pathname: string,
  options: { registry: RouteRegistry }
): RouteMatch[] {
  const logicalPath = removeRouteBasePath(
    pathname,
    normalizeRouteBasePath(options.registry.manifest.basePath)
  );
  if (logicalPath === undefined) return [];
  return computeMatchesFromRouteRecords(
    canonicalMatchPath(logicalPath, options.registry.manifest),
    options.registry.manifest.records
  ).slice(-1);
}

/** Match a path against a route registry without resolving route policies or loading data. */
export function matchRoute<TAppMeta = unknown>(
  pathname: string,
  options: { registry: RouteRegistry }
): RouteMatch<RouteParams, TAppMeta> | null {
  if (!options?.registry) {
    throw new TypeError('matchRoute requires options.registry.');
  }

  return (computeRouteActivityMatches(pathname, options)[0] ??
    null) as RouteMatch<RouteParams, TAppMeta> | null;
}

export function resolveRoute(pathname: string): ResolvedRoute | null {
  const match = matchIndexedRecords(pathname, getRouteRecords());
  return match ? { handler: match.record.handler, params: match.params } : null;
}

export function resolveRouteFromRoutes(
  pathname: string,
  routeList: readonly Route[]
): ResolvedRoute | null {
  if (isRouteStoreRoutes(routeList)) return resolveRoute(pathname);

  const match = findBestResolvedRouteFromRoutes(pathname, routeList);
  return match ? { handler: match.route.handler, params: match.params } : null;
}
