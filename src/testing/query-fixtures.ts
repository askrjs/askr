import {
  loadingQueryState,
  freshQueryState,
  refreshingQueryState,
  staleQueryState,
  errorQueryState,
} from '../data/query-state';
import type { Query, QueryStaleReason } from '../data';

/** Refresh callback for a {@link mockQuery} fixture, invoked by the query's `refresh()`. */
export type MockRefresh = () => void | Promise<void>;

/** Options for {@link mockQuery} fixtures. */
export interface MockQueryOptions {
  refresh?: MockRefresh;
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
  return makeQuery(freshQueryState(data), options);
}

/**
 * Build a fresh {@link Query} fixture for tests: call directly with data, or
 * use `.loading()`/`.error()`/`.refreshing()`/`.stale()`/`.pendingWrite()`.
 */
export const mockQuery = Object.assign(createFreshQuery, {
  loading<T extends {} = {}>(options?: MockQueryOptions): Query<T> {
    return makeQuery<T>(loadingQueryState<T>(), options);
  },

  error<T extends {} = {}>(
    error: {},
    previousData?: T,
    options?: MockQueryOptions
  ): Query<T> {
    return makeQuery(
      errorQueryState(previousData ?? null, error) as Omit<Query<T>, 'refresh'>,
      options
    );
  },

  refreshing<T extends {}>(data: T, options?: MockQueryOptions): Query<T> {
    return makeQuery(refreshingQueryState(data, 'refreshing'), options);
  },

  stale<T extends {}>(
    data: T,
    reason: StaleValueReason = 'inconsistent',
    options?: MockQueryOptions
  ): Query<T> {
    return makeQuery(staleQueryState(data, reason), options);
  },

  pendingWrite<T extends {}>(data: T, options?: MockQueryOptions): Query<T> {
    return makeQuery(refreshingQueryState(data, 'pending-write'), options);
  },
});

/** Alias table mirroring {@link mockQuery}'s state builders (`fresh`, `loading`, `error`, ...). */
export const queryState = {
  fresh: createFreshQuery,
  loading: mockQuery.loading,
  error: mockQuery.error,
  refreshing: mockQuery.refreshing,
  stale: mockQuery.stale,
  pendingWrite: mockQuery.pendingWrite,
};
