import { getActiveRenderContext } from '../common/render-context';
import {
  currentAppRuntime as getCurrentAppRenderRuntime,
  type ComponentInstance,
} from '../core/api/hooks';
import {
  emitInvalidation,
  hasInvalidationListeners,
} from './invalidation-listeners';
import type { MutationCell } from './mutation-cell';
import type { QueryCell } from './query-cell';
import { invalidateCollectionCell } from './collection-invalidation';
import type { DataRuntime, DataRuntimeOptions } from './types';

export type QuerySlot = {
  key: string;
  cell: QueryCell<unknown>;
};

export type MutationSlot = {
  key: string | undefined;
  cell: MutationCell<unknown, unknown>;
};

/** A prefetch fetch in flight for one query key; see createQueryPrefetchContext. */
export type InflightPrefetch = {
  /** Signal of the prefetch context that started the fetch. */
  readonly signal: AbortSignal;
  readonly promise: Promise<{}>;
  /** Callers (owner and joiners) that have not finished storing yet. */
  waiters: number;
  /** Set once an invalidation covers the key; the result is then discarded. */
  invalidated?: boolean;
};

export type DataRuntimeState = {
  retired: boolean;
  readonly retirement: AbortController;
  readonly retirementOwners: Set<WeakRef<DataRuntimeRetirementOwner>>;
  queryCache: Map<string, QueryCell<unknown>>;
  queryData: Map<string, unknown>;
  /** Unread browser-prefetched `queryData` entries, oldest first. */
  unreadPrefetches: Map<string, unknown>;
  /**
   * Prefetch fetches by query key, kept until their last caller has stored
   * (or discarded) the result so an invalidation can still reach it.
   */
  prefetches: Map<string, InflightPrefetch>;
  querySlotsByGeneration: WeakMap<object, Map<number, QuerySlot>>;
  mutationSlotsByGeneration: WeakMap<object, Map<number, MutationSlot>>;
  queryCleanupRegistered: WeakSet<object>;
  mutationCleanupRegistered: WeakSet<object>;
  queryTestOverrides: Map<string, unknown>;
  mutationTestOverrides: Map<string, unknown>;
};

interface DataRuntimeRetirementOwner {
  retire(): void;
}

const retiredOwnerFinalizer = new FinalizationRegistry<{
  owners: DataRuntimeState['retirementOwners'];
  reference: WeakRef<DataRuntimeRetirementOwner>;
}>(({ owners, reference }) => owners.delete(reference));

/** Track retained handles without keeping evicted/ownerless cells alive. */
export function registerDataRuntimeOwner(
  state: DataRuntimeState,
  owner: DataRuntimeRetirementOwner
): () => void {
  assertDataRuntimeActive(state);
  const reference = new WeakRef(owner);
  state.retirementOwners.add(reference);
  retiredOwnerFinalizer.register(
    owner,
    { owners: state.retirementOwners, reference },
    reference
  );
  return () => {
    state.retirementOwners.delete(reference);
    retiredOwnerFinalizer.unregister(reference);
  };
}

function dataRuntimeDisposedError(): Error {
  const error = new Error(
    '[Askr] data runtime was disposed. Create a new isolated runtime with createDataRuntime().'
  );
  error.name = 'AbortError';
  return error;
}

export function assertDataRuntimeActive(state: DataRuntimeState): void {
  if (state.retired) throw state.retirement.signal.reason;
}

const dataRuntimeStates = new WeakMap<DataRuntime, DataRuntimeState>();
const dataRuntimeByQueryCache = new WeakMap<
  Map<string, unknown>,
  DataRuntime
>();

function createDataRuntimeState(
  queryCache: Map<string, unknown>,
  queryData: Map<string, unknown>
): DataRuntimeState {
  return {
    retired: false,
    retirement: new AbortController(),
    retirementOwners: new Set(),
    queryCache: queryCache as Map<string, QueryCell<unknown>>,
    queryData,
    unreadPrefetches: new Map(),
    prefetches: new Map(),
    querySlotsByGeneration: new WeakMap(),
    mutationSlotsByGeneration: new WeakMap(),
    queryCleanupRegistered: new WeakSet(),
    mutationCleanupRegistered: new WeakSet(),
    queryTestOverrides: new Map(),
    mutationTestOverrides: new Map(),
  };
}

/** Create a new, isolated {@link DataRuntime} with its own query/mutation caches. */
export function createDataRuntime(
  options: DataRuntimeOptions = {}
): DataRuntime {
  const runtime: DataRuntime = Object.freeze({
    queryCache: options.queryCache ?? new Map<string, unknown>(),
    queryData: options.queryData ?? new Map<string, unknown>(),
  });
  dataRuntimeStates.set(
    runtime,
    createDataRuntimeState(runtime.queryCache, runtime.queryData)
  );
  dataRuntimeByQueryCache.set(runtime.queryCache, runtime);
  return runtime;
}

const defaultDataRuntime = createDataRuntime();

/** Get the process-wide default {@link DataRuntime} used when none is provided explicitly. */
export function getDefaultDataRuntime(): DataRuntime {
  return defaultDataRuntime;
}

/** Terminally retire an isolated runtime and all its retained data/work. */
export function disposeDataRuntime(runtime: DataRuntime): void {
  const state = getDataRuntimeState(runtime);
  if (runtime === defaultDataRuntime) {
    throw new Error(
      '[Askr] The shared default data runtime cannot be disposed. Create an isolated runtime with createDataRuntime().'
    );
  }
  if (state.retired) return;
  state.retired = true;
  // Establish the rejection reason before any user rollback/abort callbacks.
  state.retirement.abort(dataRuntimeDisposedError());
  try {
    drain(state.retirementOwners, (reference) => {
      retiredOwnerFinalizer.unregister(reference);
      reference.deref()?.retire();
    });
  } finally {
    state.retirementOwners.clear();
    state.queryCache.clear();
    state.queryData.clear();
    state.unreadPrefetches.clear();
    state.prefetches.clear();
    state.queryTestOverrides.clear();
    state.mutationTestOverrides.clear();
  }
}

function getDataRuntimeState(runtime: DataRuntime): DataRuntimeState {
  const state = dataRuntimeStates.get(runtime);
  if (!state) {
    throw new Error(
      '[Askr] data runtime was not created by createDataRuntime().'
    );
  }
  return state;
}

function isDataRuntime(value: unknown): value is DataRuntime {
  return (
    typeof value === 'object' &&
    value !== null &&
    dataRuntimeStates.has(value as DataRuntime)
  );
}

function getDataRuntimeForQueryCache(
  queryCache: Map<string, unknown>
): DataRuntime {
  let runtime = dataRuntimeByQueryCache.get(queryCache);
  if (!runtime) {
    runtime = createDataRuntime({ queryCache });
    dataRuntimeByQueryCache.set(queryCache, runtime);
  }
  return runtime;
}

function getActiveDataRuntime(): DataRuntime {
  const ctx = getActiveRenderContext();
  if (isDataRuntime(ctx?.dataRuntime)) {
    return ctx.dataRuntime;
  }

  if (ctx?.queryCache) {
    return getDataRuntimeForQueryCache(ctx.queryCache);
  }

  const appRuntime = getCurrentAppRenderRuntime();
  if (appRuntime?.dataRuntime) {
    return appRuntime.dataRuntime;
  }

  return defaultDataRuntime;
}

function getActiveDataRuntimeState(): DataRuntimeState {
  return getDataRuntimeState(getActiveDataRuntime());
}

export function resolveDataRuntimeState(
  runtime?: DataRuntime,
  existingReader = false
): DataRuntimeState {
  const state = runtime
    ? getDataRuntimeState(runtime)
    : getActiveDataRuntimeState();
  if (!existingReader) assertDataRuntimeActive(state);
  return state;
}

/** State for a runtime from createDataRuntime(); undefined for hand-built ones. */
export function findDataRuntimeState(
  runtime: DataRuntime
): DataRuntimeState | undefined {
  return dataRuntimeStates.get(runtime);
}

/** Maximum number of unread client-prefetched entries kept per runtime. */
export const PREFETCHED_QUERY_DATA_LIMIT = 50;

/**
 * Read hydrated or prefetched data for a new query cell. Client readers
 * consume it: the cell owns the value from then on, so keeping the entry would
 * revive it as fresh after the cell is gone.
 */
export function readQueryData(
  runtimeState: DataRuntimeState,
  key: string,
  consume: boolean
): unknown {
  const value = runtimeState.queryData.get(key);
  if (consume) {
    runtimeState.queryData.delete(key);
    runtimeState.unreadPrefetches.delete(key);
  }
  return value;
}

/**
 * Store browser-prefetched data. Unread entries are capped: the oldest one is
 * evicted once more than {@link PREFETCHED_QUERY_DATA_LIMIT} are waiting.
 * Entries replaced or removed through `queryData` directly are no longer
 * tracked and are never evicted by the cap.
 */
export function writePrefetchedQueryData(
  runtimeState: DataRuntimeState,
  key: string,
  value: unknown
): void {
  const { queryData, unreadPrefetches } = runtimeState;
  queryData.set(key, value);
  unreadPrefetches.delete(key);
  unreadPrefetches.set(key, value);
  for (const [oldestKey, oldestValue] of unreadPrefetches) {
    if (unreadPrefetches.size <= PREFETCHED_QUERY_DATA_LIMIT) return;
    unreadPrefetches.delete(oldestKey);
    if (queryData.get(oldestKey) === oldestValue) queryData.delete(oldestKey);
  }
}

/** Run `fn` for every entry even when some throw; rethrow the failures. */
function drain<T>(entries: Iterable<T>, fn: (entry: T) => void): void {
  const errors: unknown[] = [];
  for (const entry of Array.from(entries)) {
    try {
      fn(entry);
    } catch (error) {
      errors.push(error);
    }
  }
  if (errors.length === 1) throw errors[0];
  if (errors.length > 1) {
    throw new AggregateError(errors, 'Data cleanup failed');
  }
}

export function getQuerySlotStore(
  runtimeState: DataRuntimeState,
  instance: ComponentInstance
): Map<number, QuerySlot> {
  const generation: object = instance;
  let store = runtimeState.querySlotsByGeneration.get(generation);
  if (!store) {
    store = new Map();
    runtimeState.querySlotsByGeneration.set(generation, store);
  }
  return store;
}

export function getMutationSlotStore(
  runtimeState: DataRuntimeState,
  instance: ComponentInstance
): Map<number, MutationSlot> {
  const generation: object = instance;
  let store = runtimeState.mutationSlotsByGeneration.get(generation);
  if (!store) {
    store = new Map();
    runtimeState.mutationSlotsByGeneration.set(generation, store);
  }
  return store;
}

export function ensureQueryCleanup(
  runtimeState: DataRuntimeState,
  instance: ComponentInstance
): void {
  const generation: object = instance;
  if (runtimeState.queryCleanupRegistered.has(generation)) {
    return;
  }

  runtimeState.queryCleanupRegistered.add(generation);
  const slots = getQuerySlotStore(runtimeState, instance);
  instance.onCleanup(() => {
    try {
      drain(slots, ([hookIndex, slot]) =>
        slot.cell.detach(generation, hookIndex)
      );
    } finally {
      slots.clear();
      runtimeState.querySlotsByGeneration.delete(generation);
      runtimeState.queryCleanupRegistered.delete(generation);
    }
  });
}

export function ensureMutationCleanup(
  runtimeState: DataRuntimeState,
  instance: ComponentInstance
): void {
  const generation: object = instance;
  if (runtimeState.mutationCleanupRegistered.has(generation)) {
    return;
  }

  runtimeState.mutationCleanupRegistered.add(generation);
  const slots = getMutationSlotStore(runtimeState, instance);
  instance.onCleanup(() => {
    try {
      drain(slots.values(), (slot) => slot.cell.abort());
    } finally {
      slots.clear();
      runtimeState.mutationSlotsByGeneration.delete(generation);
      runtimeState.mutationCleanupRegistered.delete(generation);
    }
  });
}

/**
 * Whether `key` falls under the invalidation `prefix`, matching whole
 * `:`-delimited segments: `user:1` covers `user:1` and `user:1:posts` but not
 * `user:10`. A prefix that already ends in `:` (every `queryScope()` prefix
 * does) covers everything below it, and the empty prefix covers every key.
 */
function matchesInvalidationPrefix(key: string, prefix: string): boolean {
  return (
    key.startsWith(prefix) &&
    (key.length === prefix.length ||
      prefix.length === 0 ||
      prefix.endsWith(':') ||
      key[prefix.length] === ':')
  );
}

export function invalidateQueriesForRuntime(
  runtimeState: DataRuntimeState,
  prefix: string,
  markPendingWrite: boolean
): void {
  if (runtimeState.retired) return;
  if (hasInvalidationListeners()) {
    emitInvalidation({ prefix, markPendingWrite });
  }

  // A prefetch that started before this invalidation must neither be joined
  // nor store its result.
  for (const [key, prefetch] of runtimeState.prefetches) {
    if (matchesInvalidationPrefix(key, prefix)) {
      prefetch.invalidated = true;
      runtimeState.prefetches.delete(key);
    }
  }

  for (const key of runtimeState.queryData.keys()) {
    if (matchesInvalidationPrefix(key, prefix)) {
      runtimeState.queryData.delete(key);
      runtimeState.unreadPrefetches.delete(key);
    }
  }

  const cache = runtimeState.queryCache;

  for (const [key, query] of cache) {
    if (!matchesInvalidationPrefix(key, prefix)) {
      continue;
    }

    if (markPendingWrite) {
      query.markPendingWrite();
    }

    if (!invalidateCollectionCell(query)) query.invalidate();
  }
}

/** Refresh eligible live cells without evicting prefetches or cancelling work. */
export function refreshQueriesOnActivity(
  runtimeState: DataRuntimeState,
  prefix: string,
  staleTimeMs: number | 'always'
): void {
  if (runtimeState.retired) return;
  const now = Date.now();
  for (const [key, query] of runtimeState.queryCache) {
    if (
      matchesInvalidationPrefix(key, prefix) &&
      query.needsActivityRefresh(staleTimeMs, now)
    ) {
      // Preserve the concurrency budget of collection readers too.
      if (!invalidateCollectionCell(query)) void query.refresh();
    }
  }
}
