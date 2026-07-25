import type { Query, QueryStaleReason } from '../data';
import type {
  ParsedSegment,
  RouteRegistry,
  RouteMatch,
  RouteRecord,
} from '../common/router';
import {
  type InvalidationEvent,
  addInvalidationListener,
} from '../data/testing';
import { computeRouteActivityMatches } from '../router/testing';

export type MockRefresh = () => void | Promise<void>;

export interface MockQueryOptions {
  refresh?: MockRefresh;
}

export interface InvalidationRecord {
  prefix: string;
  markPendingWrite: boolean;
}

export interface InvalidationRecorder {
  readonly calls: readonly InvalidationRecord[];
  readonly prefixes: readonly string[];
  clear(): void;
  stop(): void;
}

interface MatchRouteOptions {
  registry: RouteRegistry;
}

export interface RoutePatternWarning {
  kind: 'route-collision';
  path: string;
  conflictingPath: string;
  segment: string;
  namespace: string | undefined;
  message: string;
}

type StaleValueReason = Exclude<QueryStaleReason, 'error'>;

function normalizeRefresh(options?: MockQueryOptions): () => Promise<void> {
  return async () => {
    await options?.refresh?.();
  };
}

function makeQuery<T extends {}>(
  state: Omit<Query<T>, 'refresh'>,
  options?: MockQueryOptions
): Query<T> {
  return {
    ...state,
    refresh: normalizeRefresh(options),
  } as Query<T>;
}

function createFreshQuery<T extends {}>(
  data: T,
  options?: MockQueryOptions
): Query<T> {
  return makeQuery(
    {
      data,
      error: null,
      loading: false,
      refreshing: false,
      stale: false,
      consistency: 'fresh',
      staleReason: null,
    },
    options
  );
}

export const mockQuery = Object.assign(createFreshQuery, {
  loading<T extends {} = {}>(options?: MockQueryOptions): Query<T> {
    return makeQuery<T>(
      {
        data: null,
        error: null,
        loading: true,
        refreshing: false,
        stale: false,
        consistency: 'fresh',
        staleReason: null,
      },
      options
    );
  },

  error<T extends {} = {}>(
    error: {},
    previousData?: T,
    options?: MockQueryOptions
  ): Query<T> {
    return makeQuery(
      {
        data: previousData ?? null,
        error,
        loading: false,
        refreshing: false,
        stale: true,
        consistency: 'stale',
        staleReason: 'error',
      } as Omit<Query<T>, 'refresh'>,
      options
    );
  },

  refreshing<T extends {}>(data: T, options?: MockQueryOptions): Query<T> {
    return makeQuery(
      {
        data,
        error: null,
        loading: false,
        refreshing: true,
        stale: true,
        consistency: 'refreshing',
        staleReason: null,
      },
      options
    );
  },

  stale<T extends {}>(
    data: T,
    reason: StaleValueReason = 'inconsistent',
    options?: MockQueryOptions
  ): Query<T> {
    return makeQuery(
      {
        data,
        error: null,
        loading: false,
        refreshing: false,
        stale: true,
        consistency: 'stale',
        staleReason: reason,
      },
      options
    );
  },

  pendingWrite<T extends {}>(data: T, options?: MockQueryOptions): Query<T> {
    return makeQuery(
      {
        data,
        error: null,
        loading: false,
        refreshing: true,
        stale: true,
        consistency: 'pending-write',
        staleReason: null,
      },
      options
    );
  },
});

export const queryState = {
  fresh: createFreshQuery,
  loading: mockQuery.loading,
  error: mockQuery.error,
  refreshing: mockQuery.refreshing,
  stale: mockQuery.stale,
  pendingWrite: mockQuery.pendingWrite,
};

export function createInvalidationRecorder(): InvalidationRecorder {
  const records: InvalidationRecord[] = [];
  let active = true;

  const unsubscribe = addInvalidationListener((event: InvalidationEvent) => {
    records.push({
      prefix: event.prefix,
      markPendingWrite: event.markPendingWrite,
    });
  });

  return {
    get calls() {
      return records.slice();
    },

    get prefixes() {
      return records.map((record) => record.prefix);
    },

    clear() {
      records.length = 0;
    },

    stop() {
      if (!active) {
        return;
      }

      active = false;
      unsubscribe();
    },
  };
}

export function matchRoute(
  path: string,
  options: MatchRouteOptions
): RouteMatch | null {
  if (!options?.registry) {
    throw new TypeError('matchRoute requires options.registry.');
  }

  return (
    computeRouteActivityMatches(path, {
      manifest: options.registry.manifest,
    })[0] ?? null
  );
}

type RoutePatternRecord = {
  path: string;
  segments: ParsedSegment[];
  namespace: string | undefined;
};

function getRoutePatternRecords(
  options: MatchRouteOptions
): RoutePatternRecord[] {
  if (!options?.registry) {
    throw new TypeError('getRouteWarnings requires options.registry.');
  }

  return options.registry.manifest.records.map((record: RouteRecord) => ({
    path: record.path,
    segments: record.segments,
    namespace: record.options.namespace,
  }));
}

function routePrefixMatches(
  splatPrefix: readonly ParsedSegment[],
  routeSegments: readonly ParsedSegment[]
): boolean {
  if (routeSegments.length <= splatPrefix.length) {
    return false;
  }

  for (let index = 0; index < splatPrefix.length; index++) {
    const splatSegment = splatPrefix[index];
    const routeSegment = routeSegments[index];

    if (
      splatSegment.kind === 'static' &&
      routeSegment.kind === 'static' &&
      splatSegment.value !== routeSegment.value
    ) {
      return false;
    }
  }

  return true;
}

export function getRouteWarnings(
  options: MatchRouteOptions
): RoutePatternWarning[] {
  const records = getRoutePatternRecords(options);
  const warnings: RoutePatternWarning[] = [];

  for (const record of records) {
    const splatIndex = record.segments.findIndex(
      (segment) => segment.kind === 'splat'
    );
    if (splatIndex === -1) {
      continue;
    }

    const splatPrefix = record.segments.slice(0, splatIndex);
    for (const candidate of records) {
      if (
        candidate === record ||
        candidate.namespace !== record.namespace ||
        !routePrefixMatches(splatPrefix, candidate.segments)
      ) {
        continue;
      }

      const reservedSegment = candidate.segments[splatIndex];
      if (reservedSegment?.kind !== 'static') {
        continue;
      }

      warnings.push({
        kind: 'route-collision',
        path: record.path,
        conflictingPath: candidate.path,
        segment: reservedSegment.value,
        namespace: record.namespace,
        message: `Route "${candidate.path}" reserves segment "${reservedSegment.value}" under named splat route "${record.path}".`,
      });
    }
  }

  return warnings.sort((left, right) => {
    const pathOrder = left.path.localeCompare(right.path);
    if (pathOrder !== 0) {
      return pathOrder;
    }
    return left.conflictingPath.localeCompare(right.conflictingPath);
  });
}
