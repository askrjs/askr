import {
  getComponentLifetimeIdentity,
  ownComponentCleanup,
} from '../runtime/component/capabilities';
import { drainOwnedCleanup } from '../runtime/ownership/record';
import { getActiveRenderContext } from '../common/render-context';
import { getCurrentAppRenderRuntime } from '../runtime';
import type { ComponentInstance } from '../runtime';
import {
  emitInvalidation,
  hasInvalidationListeners,
} from './invalidation-listeners';
import type { MutationCell } from './mutation-cell';
import type { QueryCell } from './query-cell';
import type { DataRuntime, DataRuntimeOptions } from './types';

export type QuerySlot = {
  key: string;
  cell: QueryCell<unknown>;
};

export type MutationSlot = {
  key: string | undefined;
  cell: MutationCell<unknown, unknown>;
};

export type DataRuntimeState = {
  queryCache: Map<string, QueryCell<unknown>>;
  queryData: Map<string, unknown>;
  /** Unread browser-prefetched `queryData` entries, oldest first. */
  unreadPrefetches: Map<string, unknown>;
  querySlotsByGeneration: WeakMap<object, Map<number, QuerySlot>>;
  mutationSlotsByGeneration: WeakMap<object, Map<number, MutationSlot>>;
  queryCleanupRegistered: WeakSet<object>;
  mutationCleanupRegistered: WeakSet<object>;
  queryTestOverrides: Map<string, unknown>;
  mutationTestOverrides: Map<string, unknown>;
};

const dataRuntimeStates = new WeakMap<DataRuntime, DataRuntimeState>();
const dataRuntimeByQueryCache = new WeakMap<
  Map<string, unknown>,
  DataRuntime
>();

function createDataRuntimeState(
  queryCache: Map<string, unknown>,
  queryData: Map<string, unknown>,
  queryTestOverrides: Map<string, unknown>,
  mutationTestOverrides: Map<string, unknown>
): DataRuntimeState {
  return {
    queryCache: queryCache as Map<string, QueryCell<unknown>>,
    queryData,
    unreadPrefetches: new Map(),
    querySlotsByGeneration: new WeakMap(),
    mutationSlotsByGeneration: new WeakMap(),
    queryCleanupRegistered: new WeakSet(),
    mutationCleanupRegistered: new WeakSet(),
    queryTestOverrides,
    mutationTestOverrides,
  };
}

/** Create a new, isolated {@link DataRuntime} with its own query/mutation caches. */
export function createDataRuntime(
  options: DataRuntimeOptions = {}
): DataRuntime {
  const runtime: DataRuntime = Object.freeze({
    queryCache: options.queryCache ?? new Map<string, unknown>(),
    queryData: options.queryData ?? new Map<string, unknown>(),
    queryTestOverrides:
      options.queryTestOverrides ?? new Map<string, unknown>(),
    mutationTestOverrides:
      options.mutationTestOverrides ?? new Map<string, unknown>(),
  });
  dataRuntimeStates.set(
    runtime,
    createDataRuntimeState(
      runtime.queryCache,
      runtime.queryData,
      runtime.queryTestOverrides,
      runtime.mutationTestOverrides
    )
  );
  dataRuntimeByQueryCache.set(runtime.queryCache, runtime);
  return runtime;
}

const defaultDataRuntime = createDataRuntime();

/** Get the process-wide default {@link DataRuntime} used when none is provided explicitly. */
export function getDefaultDataRuntime(): DataRuntime {
  return defaultDataRuntime;
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
  runtime?: DataRuntime
): DataRuntimeState {
  return runtime ? getDataRuntimeState(runtime) : getActiveDataRuntimeState();
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

export function getQuerySlotStore(
  runtimeState: DataRuntimeState,
  instance: ComponentInstance
): Map<number, QuerySlot> {
  const generation = getComponentLifetimeIdentity(instance);
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
  const generation = getComponentLifetimeIdentity(instance);
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
  const generation = getComponentLifetimeIdentity(instance);
  if (runtimeState.queryCleanupRegistered.has(generation)) {
    return;
  }

  runtimeState.queryCleanupRegistered.add(generation);
  const slots = getQuerySlotStore(runtimeState, instance);
  ownComponentCleanup(instance, () => {
    try {
      drainOwnedCleanup(slots, ([hookIndex, slot]) =>
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
  const generation = getComponentLifetimeIdentity(instance);
  if (runtimeState.mutationCleanupRegistered.has(generation)) {
    return;
  }

  runtimeState.mutationCleanupRegistered.add(generation);
  const slots = getMutationSlotStore(runtimeState, instance);
  ownComponentCleanup(instance, () => {
    try {
      drainOwnedCleanup(slots.values(), (slot) => slot.cell.abort());
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
  if (hasInvalidationListeners()) {
    emitInvalidation({ prefix, markPendingWrite });
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

    query.invalidate();
  }
}
