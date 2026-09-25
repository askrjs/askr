import { ownCleanup } from '../ownership/record';
import { notifyReadableSource } from './notify';
import {
  claimHookIndex,
  getCurrentComponentInstance,
} from '../component/scope';
import { type ComponentInstance } from '../component/instance';
import {
  getRuntimeFlushVersion,
  getRuntimeScheduler,
  requestRuntimeWork,
} from '../access';
import { createFlushLoopGuard } from '../flush-loop-guard';
import { ScheduledWork } from '../scheduled-work';
import {
  clearDerivedDependencySubscriptions,
  isReadableReadByInstance,
  recordReadableRead,
  scheduleReadableInstanceUpdate,
  syncDerivedDependencySubscriptions,
  type DerivedSubscriber,
  type ReadableSource,
  withDerivedReadTracking,
} from './readable';
import { isSnapshotSource, type SnapshotSourceBrand } from './snapshot-source';
import { adjustOwnershipDiagnostic } from '../diagnostics/ownership-diagnostics';
import {
  beginPendingCheckPass,
  deferBehindPendingRender,
  hasPendingOwnerRender,
} from '../component/pending-render';

declare const __ASKR_DEVELOPMENT_BUILD__: boolean;

/** A reactive derived value produced by {@link derive}; call it to read the current result. */
export interface Derived<T> extends ReadableSource<T> {
  (): T;
}

interface DerivedCell<T> extends Derived<T>, DerivedSubscriber {
  _owner: ComponentInstance;
  _hookIndex: number;
  _compute: () => T;
  /** The derive() inputs whose closure `_compute` wraps. */
  _source: unknown;
  _map: unknown;
  _value: T;
  _hasValue: boolean;
  _dirty: boolean;
  _pending: boolean;
  _evaluating: boolean;
  _active: boolean;
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
const derivedWork = new ScheduledWork(flushDirtyDerivedCells, true);
const derivedLoopGuard = createFlushLoopGuard<DerivedCell<unknown>>('derive()');

function getDeriveStore(
  instance: ComponentInstance
): Map<number, DerivedCell<unknown>> {
  const generation = instance.owner.identity;
  let store = deriveCells.get(generation);
  if (!store) {
    store = new Map();
    deriveCells.set(generation, store);
  }
  return store;
}

function markDerivedCellDirty(cell: DerivedCell<unknown>): void {
  cell._dirty = true;
  if (!cell._pending) {
    cell._pending = true;
    dirtyDerivedCells.add(cell);
  }
  requestRuntimeWork('derived', derivedWork);
}

/**
 * Whether the owner's render consumes this cell, directly or through other
 * cells of the same owner. A change to such a cell has to re-render the
 * owner, and the owner's next render replaces the closure.
 */
function isReadByOwnerRender(
  cell: DerivedCell<unknown>,
  visited: Set<DerivedCell<unknown>> = new Set()
): boolean {
  const owner = cell._owner;
  if (isReadableReadByInstance(cell, owner)) {
    return true;
  }
  visited.add(cell);
  const subscribers = cell._derivedSubscribers;
  if (!subscribers) {
    return false;
  }
  for (const subscriber of subscribers) {
    const dependent = subscriber as Partial<DerivedCell<unknown>>;
    if (
      dependent._owner === owner &&
      !visited.has(dependent as DerivedCell<unknown>) &&
      isReadByOwnerRender(dependent as DerivedCell<unknown>, visited)
    ) {
      return true;
    }
  }
  return false;
}

function flushDirtyDerivedCells(): void {
  if (dirtyDerivedCells.size === 0) {
    return;
  }

  const pending = dirtyDerivedCells.values();
  const scheduler = getRuntimeScheduler();
  beginPendingCheckPass();
  let failures: unknown[] | null = null;
  let next = pending.next();

  while (!next.done) {
    const cell = next.value as DerivedCell<unknown>;
    dirtyDerivedCells.delete(cell);
    cell._pending = false;
    if (!cell._dirty) {
      next = pending.next();
      continue;
    }
    // Eager evaluation uses the closure from the owner's last render. That is
    // sound while the owner has not re-rendered: its captured locals are
    // current. When the owner is already queued to re-render, the render
    // will install a new closure, so leave the cell dirty for it.
    if (
      cell._active &&
      cell._owner.hasPendingUpdate &&
      isReadByOwnerRender(cell)
    ) {
      next = pending.next();
      continue;
    }
    // A queued ancestor render or boundary reconcile decides whether the
    // owner survives and with which props. Evaluate after it, not with the
    // owner's stale props (#523).
    if (cell._active && hasPendingOwnerRender(cell._owner)) {
      deferBehindPendingRender(cell);
      next = pending.next();
      continue;
    }
    // The dirty set is iterated live, so a cycle of writing derives would
    // never leave this walk. Skip a looping cell; it stays dirty and
    // recomputes on its next read.
    const loop = derivedLoopGuard(scheduler, cell);
    if (loop) {
      if (loop !== true) (failures ??= []).push(loop);
      next = pending.next();
      continue;
    }
    try {
      recomputeDerivedCell(cell);
    } catch (error) {
      (failures ??= []).push(error);
    }
    next = pending.next();
  }

  if (failures?.length === 1) {
    throw failures[0];
  }
  if (failures && failures.length > 1) {
    throw new AggregateError(failures, 'derive() recompute failures');
  }
}

function recomputeDerivedCell<T>(cell: DerivedCell<T>): T {
  if (cell._evaluating) {
    throw new Error('derive() cannot read itself recursively');
  }

  if (!cell._dirty && cell._hasValue) {
    return cell._value;
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

  const valueChanged = cell._hasValue && !Object.is(cell._value, nextValue);
  cell._hasValue = true;
  cell._value = nextValue;
  cell._lastRecomputeFlushVersion = getRuntimeFlushVersion();

  // Outside a render, a changed value the owner's render consumes (possibly
  // only through other cells of the owner) re-renders the owner. An
  // unchanged value keeps the equality cutoff: no owner re-render.
  if (
    valueChanged &&
    getCurrentComponentInstance() === null &&
    isReadByOwnerRender(cell)
  ) {
    scheduleReadableInstanceUpdate(cell._owner);
  }
  // Publish every change to an already-published value, wherever the
  // recompute happened (#431). The component currently rendering reads the
  // new value directly and needs no follow-up render.
  if (valueChanged) {
    notifyReadableSource(cell, {
      skipCurrentDerivedSubscriber: true,
      skipInstance: getCurrentComponentInstance(),
    });
  }

  return cell._value;
}

function createDerivedCell<T>(
  instance: ComponentInstance,
  generation: object,
  store: Map<number, DerivedCell<unknown>>,
  hookIndex: number,
  source: unknown,
  map: unknown,
  compute: () => T
): DerivedCell<T> {
  const cell = function derivedGetter(): T {
    const derivedCell = cell as DerivedCell<T>;
    if (!derivedCell._active) {
      if (!derivedCell._hasValue) {
        throw new Error(
          '[Askr] derive() was disposed before producing a value.'
        );
      }
      if (__ASKR_DEVELOPMENT_BUILD__) {
        throw new Error(
          '[Askr] derive() was called after its owning component was disposed.'
        );
      }
      return derivedCell._value;
    }

    recordReadableRead(derivedCell);
    return recomputeDerivedCell(derivedCell);
  } as DerivedCell<T>;

  cell._owner = instance;
  cell._hookIndex = hookIndex;
  cell._compute = compute;
  cell._source = source;
  cell._map = map;
  cell._value = undefined as T;
  cell._hasValue = false;
  cell._dirty = true;
  cell._pending = false;
  cell._evaluating = false;
  cell._active = true;
  cell._lastRecomputeFlushVersion = -1;
  cell._sources = new Set();
  cell._markDirty = () => {
    markDerivedCellDirty(cell);
  };
  cell._cleanup = () => {
    if (!cell._active) {
      return;
    }
    cell._active = false;
    cell._pending = false;
    cell._dirty = false;
    cell._pendingDependencySources = undefined;
    dirtyDerivedCells.delete(cell);
    clearDerivedDependencySubscriptions(cell, cell._sources);
    cell._derivedSubscribers?.clear();
    const readerCount = cell._readers?.size ?? 0;
    cell._readers?.clear();
    if (__ASKR_DEVELOPMENT_BUILD__ && readerCount > 0) {
      adjustOwnershipDiagnostic('readableReaders', -readerCount);
    }
  };

  ownCleanup(instance.owner, () => {
    try {
      cell._cleanup();
    } finally {
      store.delete(hookIndex);
      if (store.size === 0 && deriveCells.get(generation) === store) {
        deriveCells.delete(generation);
      }
    }
  });

  return cell;
}

function getOrCreateDerivedCell<T>(
  instance: ComponentInstance,
  hookIndex: number,
  source: unknown,
  map: unknown,
  compute: () => T
): DerivedCell<T> {
  const store = getDeriveStore(instance);
  const existing = store.get(hookIndex) as DerivedCell<T> | undefined;
  if (existing) {
    // A new closure may capture different render locals, so a value computed
    // by the previous closure cannot be served, even within the same flush.
    // An eager derived-lane value is therefore evaluated again when the owner
    // re-renders with new inputs; this second evaluation only happens when
    // the value changed (or the owner re-rendered for another reason).
    if (
      existing._lastRecomputeFlushVersion !== getRuntimeFlushVersion() ||
      !Object.is(existing._source, source) ||
      !Object.is(existing._map, map)
    ) {
      existing._dirty = true;
    }
    existing._compute = compute;
    existing._source = source;
    existing._map = map;
    return existing;
  }

  const created = createDerivedCell(
    instance,
    instance.owner.identity,
    store,
    hookIndex,
    source,
    map,
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
      const snapshot = source as SnapshotSource<TIn>;
      // A pending resource snapshot is not a usable input, even when it
      // retains its previous value. Do not invoke user mapping functions
      // until the snapshot has settled.
      if (snapshot.pending) {
        return null;
      }
      value = snapshot.value as TIn;
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
  const instance = getCurrentComponentInstance();
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
    source,
    map,
    compute as () => TOut | null | TIn
  );
  recomputeDerivedCell(cell);
  return cell as Derived<TOut | null> | Derived<TIn>;
}
