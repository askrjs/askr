import { getActiveRenderContext } from '../common/render-context';
import type { ComponentInstance } from '../runtime';
import { emitInvalidation } from './invalidation-listeners';
import type { MutationCell } from './mutation-cell';
import type { QueryCell } from './query-cell';
import type { DataRuntime, DataRuntimeOptions } from './types';

export type QuerySlot = {
  key: string;
  cell: QueryCell<unknown>;
};

export type DataRuntimeState = {
  queryCache: Map<string, QueryCell<unknown>>;
  queryData: Map<string, unknown>;
  querySlotsByGeneration: WeakMap<object, Map<number, QuerySlot>>;
  mutationSlotsByGeneration: WeakMap<
    object,
    Map<number, MutationCell<unknown, unknown>>
  >;
  queryCleanupRegistered: WeakSet<object>;
  mutationCleanupRegistered: WeakSet<object>;
  queryTestOverrides: Map<string, unknown>;
};

const dataRuntimeStates = new WeakMap<DataRuntime, DataRuntimeState>();
const dataRuntimeByQueryCache = new WeakMap<
  Map<string, unknown>,
  DataRuntime
>();

function createDataRuntimeState(
  queryCache: Map<string, unknown>,
  queryData: Map<string, unknown>,
  queryTestOverrides: Map<string, unknown>
): DataRuntimeState {
  return {
    queryCache: queryCache as Map<string, QueryCell<unknown>>,
    queryData,
    querySlotsByGeneration: new WeakMap(),
    mutationSlotsByGeneration: new WeakMap(),
    queryCleanupRegistered: new WeakSet(),
    mutationCleanupRegistered: new WeakSet(),
    queryTestOverrides,
  };
}

export function createDataRuntime(
  options: DataRuntimeOptions = {}
): DataRuntime {
  const runtime: DataRuntime = Object.freeze({
    queryCache: options.queryCache ?? new Map<string, unknown>(),
    queryData: options.queryData ?? new Map<string, unknown>(),
    queryTestOverrides:
      options.queryTestOverrides ?? new Map<string, unknown>(),
  });
  dataRuntimeStates.set(
    runtime,
    createDataRuntimeState(
      runtime.queryCache,
      runtime.queryData,
      runtime.queryTestOverrides
    )
  );
  dataRuntimeByQueryCache.set(runtime.queryCache, runtime);
  return runtime;
}

const defaultDataRuntime = createDataRuntime();

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

export function getQuerySlotStore(
  runtimeState: DataRuntimeState,
  instance: ComponentInstance
): Map<number, QuerySlot> {
  const generation = instance._ownershipGeneration;
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
): Map<number, MutationCell<unknown, unknown>> {
  const generation = instance._ownershipGeneration;
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
  const generation = instance._ownershipGeneration;
  if (runtimeState.queryCleanupRegistered.has(generation)) {
    return;
  }

  runtimeState.queryCleanupRegistered.add(generation);
  const slots = getQuerySlotStore(runtimeState, instance);
  (instance.cleanupFns ??= []).push(() => {
    for (const [hookIndex, slot] of slots) {
      slot.cell.detach(generation, hookIndex);
    }

    slots.clear();
    runtimeState.querySlotsByGeneration.delete(generation);
    runtimeState.queryCleanupRegistered.delete(generation);
  });
}

export function ensureMutationCleanup(
  runtimeState: DataRuntimeState,
  instance: ComponentInstance
): void {
  const generation = instance._ownershipGeneration;
  if (runtimeState.mutationCleanupRegistered.has(generation)) {
    return;
  }

  runtimeState.mutationCleanupRegistered.add(generation);
  const slots = getMutationSlotStore(runtimeState, instance);
  (instance.cleanupFns ??= []).push(() => {
    for (const cell of slots.values()) {
      cell.abort();
    }

    slots.clear();
    runtimeState.mutationSlotsByGeneration.delete(generation);
    runtimeState.mutationCleanupRegistered.delete(generation);
  });
}

export function invalidateQueriesForRuntime(
  runtimeState: DataRuntimeState,
  prefix: string,
  markPendingWrite: boolean
): void {
  emitInvalidation({ prefix, markPendingWrite });

  for (const key of runtimeState.queryData.keys()) {
    if (key.startsWith(prefix)) {
      runtimeState.queryData.delete(key);
    }
  }

  const cache = runtimeState.queryCache;

  for (const [key, query] of cache) {
    if (!key.startsWith(prefix)) {
      continue;
    }

    if (markPendingWrite) {
      query.markPendingWrite();
    }

    query.invalidate();
  }
}
