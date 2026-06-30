import type {
  Route,
  RouteContext,
  RouteHandler,
  RouteManifest,
  RouteMatch,
  RouteOptions,
  RoutePolicy,
  RouteRecord,
  RouteRenderResult,
  RouteRequestOptions,
  RouteRequestResult,
  ResolvedRoute,
} from '../common/router';
import { isPromiseLike } from '../common/promise';
import { getActiveRenderContext } from '../common/render-context';
import {
  buildRouteContext,
  buildRouteContextBase,
  deepFreeze,
  parseLocation,
} from './route-context';
import { compileNodePolicies } from './access';
import {
  computeRank,
  matchSegments,
  parseSegments,
  splitPathSegments,
} from './match';
import type { InternalRoute, InternalRouteRecord } from './internal-types';
import { getRenderHandler } from './rendering';
import {
  getActiveRouteAuthOptions,
  getActiveRoutes,
  getRouteRecords,
  isRouteStoreRoutes,
} from './store';

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

function getMatchingRecord(
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
    ? getMatchingRecord(pathname, getRouteRecords())
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
  const bestMatch = getMatchingRecord(pathname, routeRecords);

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
  options: {
    manifest?: RouteManifest;
    routes?: readonly Route[];
  } = {}
): RouteMatch[] {
  if (options.manifest) {
    return computeMatchesFromRouteRecords(pathname, options.manifest.records);
  }

  if (options.routes) {
    return computeMatchesFromRoutes(pathname, options.routes);
  }

  return computeMatchesFromRoutes(pathname, getActiveRoutes());
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

function getRoutePolicies(
  options: RouteOptions | undefined
): readonly RoutePolicy[] {
  if (!options) {
    return [];
  }

  if (options.policies?.length) {
    return options.policies;
  }

  return compileNodePolicies(options);
}

function getDefaultRouteMode(): RouteContext['mode'] {
  if (typeof window !== 'undefined') {
    return 'spa';
  }

  return 'ssr';
}

function createRenderDataAwareHandler(
  handler: RouteHandler,
  data: unknown
): RouteHandler {
  return (params, context) => {
    const renderContext = getActiveRenderContext();
    if (renderContext) {
      renderContext.renderData = (data ?? null) as Record<
        string,
        unknown
      > | null;
    }

    return handler(params, context);
  };
}

function buildRenderResult(
  record: RouteRecord,
  params: Record<string, string>,
  mode: RouteContext['mode']
): RouteRequestResult | Promise<RouteRequestResult> {
  const renderHandler = getRenderHandler(record);
  const loader = mode === 'ssr' ? record.options?.loader : undefined;
  if (loader) {
    const loaded = loader({ params });
    const finalize = (data: unknown): RouteRenderResult => ({
      kind: 'render',
      handler: createRenderDataAwareHandler(renderHandler, data),
      params,
    });

    if (isPromiseLike(loaded)) {
      return Promise.resolve(loaded).then((data) => finalize(data));
    }

    return finalize(loaded);
  }

  return {
    kind: 'render',
    handler: renderHandler,
    params,
  };
}

function continueRoutePolicies(
  policies: readonly RoutePolicy[],
  context: RouteContext,
  record: RouteRecord,
  params: Record<string, string>,
  startIndex = 0
): RouteRequestResult | Promise<RouteRequestResult> {
  for (let index = startIndex; index < policies.length; index += 1) {
    const policyResult = policies[index](context);

    if (isPromiseLike(policyResult)) {
      return Promise.resolve(policyResult).then((next) => {
        if (next.kind !== 'allow') {
          return next;
        }

        return continueRoutePolicies(
          policies,
          context,
          record,
          params,
          index + 1
        );
      });
    }

    if (policyResult.kind !== 'allow') {
      return policyResult;
    }
  }

  return buildRenderResult(record, params, context.mode);
}

export function resolveRouteRequest(
  target: string,
  options: RouteRequestOptions = {}
): RouteRequestResult | Promise<RouteRequestResult> {
  const routeRecords = options.manifest?.records ?? getRouteRecords();
  const match = getMatchingRecord(target, routeRecords);

  if (!match) {
    return null;
  }

  const { record, params } = match;
  const policies = getRoutePolicies(record.options);
  const mode = options.mode ?? getDefaultRouteMode();

  if (policies.length === 0) {
    return buildRenderResult(record, params, mode);
  }

  const signal =
    options.signal ??
    getActiveRenderContext()?.signal ??
    new AbortController().signal;
  const auth = getActiveRouteAuthOptions(
    options.auth ?? options.manifest?.auth
  );
  const baseContext = buildRouteContextBase(target, params, {
    mode,
    signal,
  });

  const finalize = (authState: { session: unknown; user: unknown }) =>
    continueRoutePolicies(
      policies,
      buildRouteContext(target, params, {
        mode,
        signal,
        auth,
        session: authState.session,
        user: authState.user,
      }),
      record,
      params
    );

  if (!auth?.resolve) {
    return finalize({ session: null, user: null });
  }

  const authState = auth.resolve(baseContext);
  if (isPromiseLike(authState)) {
    return Promise.resolve(authState).then((next) => finalize(next));
  }

  return finalize(authState);
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
