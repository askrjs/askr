/** Freshness classification for a {@link Query}'s current data. */
export type QueryConsistency =
  | 'fresh'
  | 'stale'
  | 'refreshing'
  | 'pending-write';

/** Why a {@link Query} is stale. */
export type QueryStaleReason = 'aborted' | 'error' | 'inconsistent';

/** Isolated cache/state container backing queries and mutations, e.g. one per test or request. */
export interface DataRuntime {
  readonly queryCache: Map<string, unknown>;
  readonly queryData: Map<string, unknown>;
  /** Test-only query overrides keyed by the canonical query key. */
  readonly queryTestOverrides: Map<string, unknown>;
  /** Test-only mutation overrides keyed by the canonical mutation key. */
  readonly mutationTestOverrides: Map<string, unknown>;
}

/** Options for {@link createDataRuntime}. */
export interface DataRuntimeOptions {
  queryCache?: Map<string, unknown>;
  queryData?: Map<string, unknown>;
  queryTestOverrides?: Map<string, unknown>;
  mutationTestOverrides?: Map<string, unknown>;
}

/** Reusable query definition for {@link defineQuery}: key, fetcher, and freshness checks. */
export interface QueryDefinition<TInput, TResult extends {}> {
  readonly key: (input: TInput) => string;
  readonly fetch: (
    context: TInput & { signal: AbortSignal }
  ) => Promise<TResult>;
  readonly isConsistent?: (data: TResult) => boolean;
  readonly reconcile?: (
    data: TResult,
    context: { key: string }
  ) => Promise<boolean> | boolean;
}

/** Context passed to server prefetch callbacks, exposing a scoped `prefetch` helper. */
export interface QueryPrefetchContext {
  readonly runtime: DataRuntime;
  readonly request?: Request;
  readonly signal: AbortSignal;
  readonly mode: 'ssr' | 'spa';
  prefetch<TInput, TResult extends {}>(
    query: QueryDefinition<TInput, TResult>,
    input: TInput
  ): Promise<boolean>;
}

/** Server-side handler that resolves a {@link QueryDefinition}'s data for `serveQuery`. */
export type ServerQueryHandler<TInput, TResult extends {}> = (context: {
  input: TInput;
  request?: Request;
  signal: AbortSignal;
}) => Promise<TResult> | TResult;

/** Options for {@link invalidate} and {@link QueryScope.invalidate}. */
export interface InvalidateOptions {
  markPendingWrite?: boolean;
  runtime?: DataRuntime;
}

/** Options for {@link invalidateOnInterval}. */
export interface InvalidateOnIntervalOptions extends InvalidateOptions {
  intervalMs: number;
  activeOn?: string | readonly string[];
  visibleOnly?: boolean;
  focusedOnly?: boolean;
}

/** A JSON-serializable value usable as part of a query key or invalidation prefix. */
export type QueryKeyPart =
  | string
  | number
  | boolean
  | null
  | undefined
  | readonly QueryKeyPart[]
  | { readonly [key: string]: QueryKeyPart };

/** Namespaced key-building and invalidation helper returned by {@link queryScope}. */
export interface QueryScope {
  key(...parts: QueryKeyPart[]): string;
  prefix(...parts: QueryKeyPart[]): string;
  invalidate(parts: readonly QueryKeyPart[], options?: InvalidateOptions): void;
}

type QueryControls = {
  refresh(): Promise<void>;
};

type QueryLoading = {
  data: null;
  error: null;
  loading: true;
  refreshing: false;
  stale: false;
  consistency: 'fresh';
  staleReason: null;
};

type QueryFresh<T> = {
  data: T;
  error: null;
  loading: false;
  refreshing: false;
  stale: false;
  consistency: 'fresh';
  staleReason: null;
};

type QueryRefreshing<T> = {
  data: T;
  error: null;
  loading: false;
  refreshing: true;
  stale: true;
  consistency: 'refreshing';
  staleReason: null;
};

type QueryPendingWrite<T> = {
  data: T;
  error: null;
  loading: false;
  refreshing: true;
  stale: true;
  consistency: 'pending-write';
  staleReason: null;
};

type QueryStaleValue<T> = {
  data: T;
  error: null;
  loading: false;
  refreshing: false;
  stale: true;
  consistency: 'stale';
  staleReason: 'aborted' | 'inconsistent';
};

type QueryStaleErrorWithValue<T> = {
  data: T;
  error: {};
  loading: false;
  refreshing: false;
  stale: true;
  consistency: 'stale';
  staleReason: 'error';
};

type QueryStaleError = {
  data: null;
  error: {};
  loading: false;
  refreshing: false;
  stale: true;
  consistency: 'stale';
  staleReason: 'error';
};

/** Reactive read state for a query cell: data, loading/refresh flags, and freshness. */
export type Query<T extends {}> = QueryControls &
  (
    | QueryLoading
    | QueryFresh<T>
    | QueryRefreshing<T>
    | QueryPendingWrite<T>
    | QueryStaleValue<T>
    | QueryStaleErrorWithValue<T>
    | QueryStaleError
  );

type MutationControls<TInput, TResult> = {
  execute(input: TInput): Promise<TResult>;
  abort(): void;
  reset(): void;
};

type MutationIdle = {
  status: 'idle';
  pending: false;
  error: null;
  result: null;
};

type MutationPending = {
  status: 'pending';
  pending: true;
  error: null;
  result: null;
};

type MutationSuccess<TResult> = {
  status: 'success';
  pending: false;
  error: null;
  result: TResult;
};

type MutationError = {
  status: 'error';
  pending: false;
  error: {};
  result: null;
};

/** Reactive state for a mutation cell: status, error/result, and execute/abort/reset controls. */
export type Mutation<TInput, TResult> = MutationControls<TInput, TResult> &
  (MutationIdle | MutationPending | MutationSuccess<TResult> | MutationError);

export type MutationRecord<TResult> = {
  status: 'idle' | 'pending' | 'success' | 'error';
  error: {} | null;
  result: TResult | null;
};

export type QueryOptions<T> = {
  key: string;
  fetch: (ctx: { signal: AbortSignal }) => Promise<T>;
  isConsistent?: (data: T) => boolean;
  reconcile?: (data: T, ctx: { key: string }) => Promise<boolean> | boolean;
  runtime?: DataRuntime;
  initialData?: T;
  skipInitialFetch?: boolean;
};

/** Options for {@link createMutation}. */
export type MutationOptions<TInput, TResult> = {
  /** Stable identity used by runtime-scoped mutation test overrides. */
  key?: string;
  action: (input: TInput, ctx: { signal: AbortSignal }) => Promise<TResult>;
  affects?: (input: TInput, result: TResult) => string[];
  afterSuccess?: 'invalidate';
  runtime?: DataRuntime;
};

export type QueryState<T> = {
  data: T | null;
  error: {} | null;
  loading: boolean;
  refreshing: boolean;
  stale: boolean;
  consistency: QueryConsistency;
  staleReason: QueryStaleReason | null;
};

export type QueryDefinitionField = 'fetch' | 'isConsistent' | 'reconcile';
