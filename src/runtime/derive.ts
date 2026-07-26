import {
  claimHookIndex,
  getCurrentInstance,
  type ComponentInstance,
} from './component';
import { enqueueRuntimeLane, getRuntimeFlushVersion } from './access';
import {
  clearDerivedDependencySubscriptions,
  markReadableDerivedSubscribersDirty,
  markReactivePropsDirtySource,
  notifyReadableReaders,
  recordReadableRead,
  syncDerivedDependencySubscriptions,
  type DerivedSubscriber,
  type ReadableSource,
  withDerivedReadTracking,
} from './readable';
import { isSnapshotSource, type SnapshotSourceBrand } from './snapshot-source';
import { adjustOwnershipDiagnostic } from './ownership-diagnostics';

declare const __ASKR_DEVELOPMENT_BUILD__: boolean;

export interface Derived<T> extends ReadableSource<T> {
  (): T;
}

interface DerivedCell<T> extends Derived<T>, DerivedSubscriber {
  _owner: ComponentInstance;
  _hookIndex: number;
  _compute: () => T;
  _value: T;
  _hasValue: boolean;
  _dirty: boolean;
  _scheduled: boolean;
  _evaluating: boolean;
  _lastRecomputeFlushVersion: number;
  _sources: Set<ReadableSource<unknown>>;
  _pendingDependencySources?: Set<ReadableSource<unknown>>;
  _cleanup(): void;
}

type SnapshotSource<T> = {
  value: T | null;
  pending?: boolean;
  error?: Error | null;
} & SnapshotSourceBrand;

const deriveCells = new WeakMap<object, Map<number, DerivedCell<unknown>>>();
const dirtyDerivedCells = new Set<DerivedCell<unknown>>();
let hasPendingDerivedFlush = false;

function getDeriveStore(
  instance: ComponentInstance
): Map<number, DerivedCell<unknown>> {
  const generation = instance._ownershipGeneration;
  let store = deriveCells.get(generation);
  if (!store) {
    store = new Map();
    deriveCells.set(generation, store);
  }
  return store;
}

function markDerivedCellDirty(cell: DerivedCell<unknown>): void {
  cell._dirty = true;
  if (cell._scheduled) {
    return;
  }

  cell._scheduled = true;
  dirtyDerivedCells.add(cell);

  if (!hasPendingDerivedFlush) {
    hasPendingDerivedFlush = true;
    enqueueRuntimeLane('derived', flushDirtyDerivedCells);
  }
}

function flushDirtyDerivedCells(): void {
  hasPendingDerivedFlush = false;

  if (dirtyDerivedCells.size === 0) {
    return;
  }

  const pending = dirtyDerivedCells.values();
  let next = pending.next();

  while (!next.done) {
    const cell = next.value as DerivedCell<unknown>;
    dirtyDerivedCells.delete(cell);
    cell._scheduled = false;
    if (!cell._dirty) {
      next = pending.next();
      continue;
    }
    recomputeDerivedCell(cell, true);
    next = pending.next();
  }
}

function recomputeDerivedCell<T>(
  cell: DerivedCell<T>,
  notifyDownstream: boolean
): T {
  if (!cell._dirty && cell._hasValue) {
    return cell._value;
  }

  if (cell._evaluating) {
    throw new Error('derive() cannot read itself recursively');
  }

  cell._evaluating = true;
  cell._dirty = false;
  cell._pendingDependencySources = new Set();

  const prevSources = cell._sources;
  let nextValue: T;

  try {
    nextValue = withDerivedReadTracking(cell, cell._compute);
  } catch (error) {
    cell._dirty = true;
    cell._pendingDependencySources = undefined;
    throw error;
  } finally {
    cell._evaluating = false;
  }

  const nextSources = cell._pendingDependencySources ?? new Set();
  cell._pendingDependencySources = undefined;
  syncDerivedDependencySubscriptions(cell, prevSources, nextSources);
  cell._sources = nextSources;

  const valueChanged = !cell._hasValue || !Object.is(cell._value, nextValue);
  cell._hasValue = true;
  cell._value = nextValue;
  cell._lastRecomputeFlushVersion = getRuntimeFlushVersion();

  if (valueChanged && notifyDownstream) {
    markReadableDerivedSubscribersDirty(cell);
    markReactivePropsDirtySource(cell);
    notifyReadableReaders(cell);
  }

  return cell._value;
}

function createDerivedCell<T>(
  instance: ComponentInstance,
  generation: object,
  store: Map<number, DerivedCell<unknown>>,
  hookIndex: number,
  compute: () => T
): DerivedCell<T> {
  const cell = function derivedGetter(): T {
    recordReadableRead(cell as DerivedCell<T>);
    return recomputeDerivedCell(
      cell as DerivedCell<T>,
      (cell as DerivedCell<T>)._scheduled
    );
  } as DerivedCell<T>;

  cell._owner = instance;
  cell._hookIndex = hookIndex;
  cell._compute = compute;
  cell._value = undefined as T;
  cell._hasValue = false;
  cell._dirty = true;
  cell._scheduled = false;
  cell._evaluating = false;
  cell._lastRecomputeFlushVersion = -1;
  cell._sources = new Set();
  cell._markDirty = () => {
    markDerivedCellDirty(cell);
  };
  cell._cleanup = () => {
    cell._scheduled = false;
    cell._dirty = false;
    cell._hasValue = false;
    dirtyDerivedCells.delete(cell);
    clearDerivedDependencySubscriptions(cell, cell._sources);
    cell._derivedSubscribers?.clear();
    const readerCount = cell._readers?.size ?? 0;
    cell._readers?.clear();
    if (__ASKR_DEVELOPMENT_BUILD__ && readerCount > 0) {
      adjustOwnershipDiagnostic('readableReaders', -readerCount);
    }
  };

  (instance.cleanupFns ??= []).push(() => {
    cell._cleanup();
    store.delete(hookIndex);
    if (store.size === 0 && deriveCells.get(generation) === store) {
      deriveCells.delete(generation);
    }
  });

  return cell;
}

function getOrCreateDerivedCell<T>(
  instance: ComponentInstance,
  hookIndex: number,
  compute: () => T
): DerivedCell<T> {
  const store = getDeriveStore(instance);
  const existing = store.get(hookIndex) as DerivedCell<T> | undefined;
  if (existing) {
    existing._compute = compute;
    if (existing._lastRecomputeFlushVersion !== getRuntimeFlushVersion()) {
      existing._dirty = true;
    }
    return existing;
  }

  const created = createDerivedCell(
    instance,
    instance._ownershipGeneration,
    store,
    hookIndex,
    compute
  );
  store.set(hookIndex, created as DerivedCell<unknown>);
  return created;
}

function createMappedSelector<TIn, TOut>(
  source: SnapshotSource<TIn> | TIn | (() => TIn),
  map: (value: TIn) => TOut
): () => TOut | null {
  return () => {
    let value: TIn;
    if (typeof source === 'function') {
      value = (source as () => TIn)();
    } else if (isSnapshotSource(source)) {
      value = (source as SnapshotSource<TIn>).value ?? (source as TIn);
    } else {
      value = source as TIn;
    }

    if (value == null) {
      return null;
    }

    return map(value);
  };
}

/** Creates a render-scoped derived value; must be called during component render. */
export function derive<TOut>(fn: () => TOut): Derived<TOut>;

export function derive<TIn, TOut>(
  source: SnapshotSource<TIn> | TIn | (() => TIn),
  map: (value: TIn) => TOut
): Derived<TOut | null>;

export function derive<TIn, TOut>(
  source: SnapshotSource<TIn> | TIn | (() => TIn),
  map?: (value: TIn) => TOut
): Derived<TOut | null> | Derived<TIn> {
  const instance = getCurrentInstance();
  if (!instance) {
    throw new Error(
      'derive() can only be called during component render execution. ' +
        'Move derive() calls to the top level of your component function.'
    );
  }

  const hookIndex = claimHookIndex(instance, 'derive');
  const compute =
    map === undefined
      ? () => (source as () => TIn)()
      : createMappedSelector(source, map);

  const cell = getOrCreateDerivedCell(
    instance,
    hookIndex,
    compute as () => TOut | null | TIn
  );
  recomputeDerivedCell(cell, false);
  return cell as Derived<TOut | null> | Derived<TIn>;
}
