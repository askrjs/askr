export type QueryConsistency =
  | 'fresh'
  | 'stale'
  | 'refreshing'
  | 'pending-write';

export type QueryStaleReason = 'aborted' | 'error' | 'inconsistent';

export interface DataRuntime {
  readonly queryCache: Map<string, unknown>;
  readonly queryData: Map<string, unknown>;
  /** Test-only query overrides keyed by the canonical query key. */
  readonly queryTestOverrides: Map<string, unknown>;
}

export interface DataRuntimeOptions {
  queryCache?: Map<string, unknown>;
  queryData?: Map<string, unknown>;
  queryTestOverrides?: Map<string, unknown>;
}

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

export type ServerQueryHandler<TInput, TResult extends {}> = (context: {
  input: TInput;
  request?: Request;
  signal: AbortSignal;
}) => Promise<TResult> | TResult;

export interface InvalidateOptions {
  markPendingWrite?: boolean;
  runtime?: DataRuntime;
}

export interface InvalidateOnIntervalOptions extends InvalidateOptions {
  intervalMs: number;
  activeOn?: string | readonly string[];
  visibleOnly?: boolean;
  focusedOnly?: boolean;
}

export type QueryKeyPart =
  | string
  | number
  | boolean
  | null
  | undefined
  | readonly QueryKeyPart[]
  | { readonly [key: string]: QueryKeyPart };

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

export type MutationOptions<TInput, TResult> = {
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
