import type { Query, QueryStaleReason } from '../data';
import {
  addInvalidationListener,
  type InvalidationEvent,
} from '../data/invalidation-listeners';

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
    return makeQuery(
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
