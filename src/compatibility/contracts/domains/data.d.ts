import { JSXElementType, JSXElement, Props } from '../elements.js';
import '../jsx-globals.js';
import { AuthContext, AuthRequirement } from '@askrjs/auth';
import { InferSchema, ObjectSchema } from '@askrjs/schema';
import { state } from './state.js';
import { CoreTelemetry } from './telemetry.js';
import { on } from './lifecycle.js';
import { action } from './actions.js';

/** Freshness classification for a {@link Query}'s current data. */
type QueryConsistency = 'fresh' | 'stale' | 'refreshing' | 'pending-write';

/** Why a {@link Query} is stale. */
type QueryStaleReason = 'aborted' | 'error' | 'inconsistent';

/** Isolated cache/state container backing queries and mutations, e.g. one per test or request. */
interface DataRuntime {
  readonly queryCache: Map<string, unknown>;
  readonly queryData: Map<string, unknown>;
  /** Test-only query overrides keyed by the canonical query key. */
  readonly queryTestOverrides: Map<string, unknown>;
  /** Test-only mutation overrides keyed by the canonical mutation key. */
  readonly mutationTestOverrides: Map<string, unknown>;
}

/** Options for {@link createDataRuntime}. */
interface DataRuntimeOptions {
  queryCache?: Map<string, unknown>;
  queryData?: Map<string, unknown>;
  queryTestOverrides?: Map<string, unknown>;
  mutationTestOverrides?: Map<string, unknown>;
}

/** Reusable query definition for {@link defineQuery}: key, fetcher, and freshness checks. */
interface QueryDefinition<TInput, TResult extends {}> {
  readonly key: (input: TInput) => string;
  readonly fetch: (
    context: TInput & {
      signal: AbortSignal;
    }
  ) => Promise<TResult>;
  readonly isConsistent?: (data: TResult) => boolean;
  readonly reconcile?: (
    data: TResult,
    context: {
      key: string;
    }
  ) => Promise<boolean> | boolean;
}

/** Stable identity for one member of a {@link QueryCollection}. */
type QueryCollectionKey = string | number | symbol;

/** One keyed input and its underlying cache-backed query reader. */
interface QueryCollectionEntry<
  TInput,
  TResult extends {},
  TKey extends QueryCollectionKey = string,
> {
  readonly key: TKey;
  readonly input: TInput;
  readonly query: Query<TResult>;
}

/** Options for {@link createQueryCollection}. */
interface QueryCollectionOptions<
  TInput,
  TResult extends {},
  TKey extends QueryCollectionKey = string,
> {
  readonly query: QueryDefinition<TInput, TResult>;
  readonly inputs: () => readonly TInput[];
  readonly key: (input: TInput) => TKey;
  readonly concurrency?: number;
  readonly runtime?: DataRuntime;
}

/** Aggregate reactive state for a lifecycle-owned dynamic query collection. */
interface QueryCollection<
  TInput,
  TResult extends {},
  TKey extends QueryCollectionKey = string,
> {
  readonly entries: readonly QueryCollectionEntry<TInput, TResult, TKey>[];
  readonly loading: boolean;
  readonly settled: boolean;
  readonly results: ReadonlyMap<TKey, TResult>;
  readonly errors: ReadonlyMap<TKey, {}>;
  get(key: TKey): QueryCollectionEntry<TInput, TResult, TKey> | undefined;
  retry(key: TKey): Promise<void>;
}

/** Context passed to server prefetch callbacks, exposing a scoped `prefetch` helper. */
interface QueryPrefetchContext {
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
type ServerQueryHandler<TInput, TResult extends {}> = (context: {
  input: TInput;
  request?: Request;
  signal: AbortSignal;
}) => Promise<TResult> | TResult;

/** Options for {@link invalidate} and {@link QueryScope.invalidate}. */
interface InvalidateOptions {
  markPendingWrite?: boolean;
  runtime?: DataRuntime;
}

/** Options for {@link invalidateOnInterval}. */
interface InvalidateOnIntervalOptions extends InvalidateOptions {
  intervalMs: number;
  activeOn?: string | readonly string[];
  visibleOnly?: boolean;
  focusedOnly?: boolean;
}

/** A JSON-serializable value usable as part of a query key or invalidation prefix. */
type QueryKeyPart =
  | string
  | number
  | boolean
  | null
  | undefined
  | readonly QueryKeyPart[]
  | {
      readonly [key: string]: QueryKeyPart;
    };

/** Namespaced key-building and invalidation helper returned by {@link queryScope}. */
interface QueryScope {
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
type Query<T extends {}> = QueryControls &
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
type Mutation<TInput, TResult> = MutationControls<TInput, TResult> &
  (MutationIdle | MutationPending | MutationSuccess<TResult> | MutationError);

type QueryOptions<T> = {
  key: string;
  fetch: (ctx: { signal: AbortSignal }) => Promise<T>;
  isConsistent?: (data: T) => boolean;
  reconcile?: (
    data: T,
    ctx: {
      key: string;
    }
  ) => Promise<boolean> | boolean;
  runtime?: DataRuntime;
  initialData?: T;
  skipInitialFetch?: boolean;
};

/** Options for {@link createMutation}. */
type MutationOptions<TInput, TResult> = {
  /** Stable identity used by runtime-scoped mutation test overrides. */
  key?: string;
  action: (
    input: TInput,
    ctx: {
      signal: AbortSignal;
    }
  ) => Promise<TResult>;
  affects?: (input: TInput, result: TResult) => string[];
  afterSuccess?: 'invalidate';
  runtime?: DataRuntime;
};

/**
 * Create a reactive {@link Mutation} cell bound to the current component,
 * running `options.action` on `execute()` and optionally invalidating
 * affected query prefixes on success.
 */
declare function createMutation<TInput, TResult>(
  options: MutationOptions<TInput, TResult>
): Mutation<TInput, TResult>;

/**
 * Create a reactive {@link Query} cell bound to the current component, either
 * from inline `options` (key + fetch) or a reusable {@link QueryDefinition}
 * plus its input.
 */
declare function createQuery<T extends {}>(options: QueryOptions<T>): Query<T>;

declare function createQuery<TInput, TResult extends {}>(
  definition: QueryDefinition<TInput, TResult>,
  input: TInput,
  options?: Omit<QueryOptions<TResult>, 'key' | 'fetch'>
): Query<TResult>;

/** Create a new, isolated {@link DataRuntime} with its own query/mutation caches. */
declare function createDataRuntime(options?: DataRuntimeOptions): DataRuntime;

/** Get the process-wide default {@link DataRuntime} used when none is provided explicitly. */
declare function getDefaultDataRuntime(): DataRuntime;

/** Mark all cached queries whose key starts with `prefix` as stale, triggering a refresh. */
declare function invalidate(prefix: string, options?: InvalidateOptions): void;

/** Create a {@link QueryScope} that namespaces keys and invalidations under `namespace`. */
declare function queryScope(namespace: string): QueryScope;

/**
 * Periodically invalidate queries matching `prefix` on a fixed interval,
 * optionally gated by active route, document visibility, or window focus.
 */
declare function invalidateOnInterval(
  prefix: string,
  options: InvalidateOnIntervalOptions
): void;

/**
 * Create one lifecycle-owned collection of dynamically keyed readers for a
 * reusable query definition, with bounded collection-started fetches.
 */
declare function createQueryCollection<
  TInput,
  TResult extends {},
  TKey extends QueryCollectionKey = string,
>(
  options: QueryCollectionOptions<TInput, TResult, TKey>
): QueryCollection<TInput, TResult, TKey>;

/** Lookup table of server handlers keyed by their {@link QueryDefinition}, built by {@link defineServerQueries}. */
interface ServerQueryRegistry {
  readonly entries: readonly ServerQueryEntry<unknown, {}>[];
  get<TInput, TResult extends {}>(
    query: QueryDefinition<TInput, TResult>
  ): ServerQueryHandler<TInput, TResult> | undefined;
}

/** A query paired with the server handler that resolves it, produced by {@link serveQuery}. */
interface ServerQueryEntry<TInput, TResult extends {}> {
  readonly query: QueryDefinition<TInput, TResult>;
  readonly handler: ServerQueryHandler<TInput, TResult>;
}

/** Pair a {@link QueryDefinition} with the server-side handler that resolves it. */
declare function serveQuery<TInput, TResult extends {}>(
  query: QueryDefinition<TInput, TResult>,
  handler: ServerQueryHandler<TInput, TResult>
): ServerQueryEntry<TInput, TResult>;

/** Build a {@link ServerQueryRegistry} from one or more {@link serveQuery} entries. */
declare function defineServerQueries(
  ...entries: readonly ServerQueryEntry<any, any>[]
): ServerQueryRegistry;

/** Freeze and return a reusable {@link QueryDefinition}. */
declare function defineQuery<TInput, TResult extends {}>(
  definition: QueryDefinition<TInput, TResult>
): QueryDefinition<TInput, TResult>;

/**
 * Create a {@link QueryPrefetchContext} for prefetching query data ahead of
 * render, e.g. during SSR route resolution.
 */
declare function createQueryPrefetchContext(options?: {
  runtime?: DataRuntime;
  registry?: ServerQueryRegistry;
  request?: Request;
  signal?: AbortSignal;
  mode?: 'ssr' | 'spa';
  telemetry?: CoreTelemetry;
}): QueryPrefetchContext;

/** Prefetch `query` with `input` into a {@link QueryPrefetchContext}'s runtime. */
declare function prefetchQuery<TInput, TResult extends {}>(
  context: QueryPrefetchContext,
  query: QueryDefinition<TInput, TResult>,
  input: TInput
): Promise<boolean>;

/** Extract a runtime's cached query data into a JSON-serializable snapshot, dropping non-serializable values. */
declare function dehydrateDataRuntime(
  runtime: DataRuntime
): Record<string, unknown>;

/** Load a {@link dehydrateDataRuntime} snapshot back into a runtime's query cache. */
declare function hydrateDataRuntime(runtime: DataRuntime, data: unknown): void;
export {
  QueryConsistency,
  QueryStaleReason,
  DataRuntime,
  DataRuntimeOptions,
  QueryDefinition,
  QueryCollectionKey,
  QueryCollectionEntry,
  QueryCollectionOptions,
  QueryCollection,
  QueryPrefetchContext,
  ServerQueryHandler,
  InvalidateOptions,
  InvalidateOnIntervalOptions,
  QueryKeyPart,
  QueryScope,
  QueryControls,
  QueryLoading,
  QueryFresh,
  QueryRefreshing,
  QueryPendingWrite,
  QueryStaleValue,
  QueryStaleErrorWithValue,
  QueryStaleError,
  Query,
  MutationControls,
  MutationIdle,
  MutationPending,
  MutationSuccess,
  MutationError,
  Mutation,
  QueryOptions,
  MutationOptions,
  createMutation,
  createQuery,
  createDataRuntime,
  getDefaultDataRuntime,
  invalidate,
  queryScope,
  invalidateOnInterval,
  createQueryCollection,
  ServerQueryRegistry,
  ServerQueryEntry,
  serveQuery,
  defineServerQueries,
  defineQuery,
  createQueryPrefetchContext,
  prefetchQuery,
  dehydrateDataRuntime,
  hydrateDataRuntime,
};
