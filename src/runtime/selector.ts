import {
  claimHookIndex,
  getCurrentInstance,
  type ComponentInstance,
} from './component';
import { globalScheduler } from './scheduler';
import {
  clearDerivedDependencySubscriptions,
  markReadableDerivedSubscribersDirty,
  markReadableUsage,
  markReactivePropsDirtySource,
  notifyReadableReaders,
  recordReadableRead,
  syncDerivedDependencySubscriptions,
  withDerivedReadTracking,
  type DerivedSubscriber,
  type ReadableSource,
} from './readable';
import { getPerfMetricsStore, incrementPerfMetric } from './perf-metrics';

type PrimitiveKey =
  | string
  | number
  | boolean
  | symbol
  | bigint
  | null
  | undefined;

export interface Selector<T> {
  (candidate: T): boolean;
}

interface SelectorCandidateSource<T> extends ReadableSource<boolean> {
  _candidate: T;
}

type SelectorEquals<T> = {
  bivarianceHack(a: T, b: T): boolean;
}['bivarianceHack'];

interface SelectorCell<T> extends Selector<T>, DerivedSubscriber {
  _owner: ComponentInstance;
  _hookIndex: number;
  _source: () => T;
  _equals: SelectorEquals<T>;
  _value: T;
  _hasValue: boolean;
  _dirty: boolean;
  _scheduled: boolean;
  _evaluating: boolean;
  _sources: Set<ReadableSource<unknown>>;
  _pendingDependencySources?: Set<ReadableSource<unknown>>;
  _primitiveCandidates: Map<PrimitiveKey, SelectorCandidateSource<T>>;
  _objectCandidates: WeakMap<object, SelectorCandidateSource<T>>;
  _objectCandidateSources: Set<SelectorCandidateSource<T>>;
  _cleanup(): void;
}

const selectorCells = new WeakMap<
  ComponentInstance,
  Map<number, SelectorCell<unknown>>
>();
const dirtySelectorCells = new Set<SelectorCell<unknown>>();
let hasPendingSelectorFlush = false;

function getSelectorStore(
  instance: ComponentInstance
): Map<number, SelectorCell<unknown>> {
  let store = selectorCells.get(instance);
  if (!store) {
    store = new Map();
    selectorCells.set(instance, store);
  }
  return store;
}

function scheduleSelectorFlush(): void {
  if (hasPendingSelectorFlush) {
    return;
  }
  hasPendingSelectorFlush = true;
  globalScheduler.enqueueInLane('derived', flushDirtySelectorCells);
}

function markSelectorCellDirty(cell: SelectorCell<unknown>): void {
  cell._dirty = true;
  if (cell._scheduled) {
    return;
  }

  cell._scheduled = true;
  dirtySelectorCells.add(cell);
  scheduleSelectorFlush();
}

function flushDirtySelectorCells(): void {
  hasPendingSelectorFlush = false;

  if (dirtySelectorCells.size === 0) {
    return;
  }

  const pending = Array.from(dirtySelectorCells);
  dirtySelectorCells.clear();

  for (const cell of pending) {
    cell._scheduled = false;
    if (!cell._dirty) {
      continue;
    }
    recomputeSelectorCell(cell, true);
  }
}

function isObjectCandidate(value: unknown): value is object {
  return (
    (typeof value === 'object' && value !== null) || typeof value === 'function'
  );
}

function isDefaultSelectorEquals<T>(equals: SelectorEquals<T>): boolean {
  return equals === Object.is;
}

function createCandidateSource<T>(candidate: T): SelectorCandidateSource<T> {
  const source = (() => false) as SelectorCandidateSource<T>;
  source._candidate = candidate;
  return source;
}

function getCandidateSource<T>(
  cell: SelectorCell<T>,
  candidate: T
): SelectorCandidateSource<T> {
  if (isObjectCandidate(candidate)) {
    const cached = cell._objectCandidates.get(candidate);
    if (cached) {
      return cached;
    }

    const created = createCandidateSource(candidate);
    created._candidate = candidate;
    cell._objectCandidates.set(candidate, created);
    cell._objectCandidateSources.add(created);
    return created;
  }

  const key = candidate as PrimitiveKey;
  const cached = cell._primitiveCandidates.get(key);
  if (cached) {
    return cached;
  }

  const created = createCandidateSource(candidate);
  created._candidate = candidate;
  cell._primitiveCandidates.set(key, created);
  return created;
}

function notifySelectorSource(source: SelectorCandidateSource<unknown>): void {
  incrementPerfMetric('selectorInvalidations');
  markReadableDerivedSubscribersDirty(source);
  markReactivePropsDirtySource(source);
  notifyReadableReaders(source);
}

function notifyAllSelectorSources<T>(cell: SelectorCell<T>): void {
  for (const source of cell._primitiveCandidates.values()) {
    notifySelectorSource(source);
  }
  for (const source of cell._objectCandidateSources) {
    notifySelectorSource(source);
  }
}

function notifySelectorValueChange<T>(
  cell: SelectorCell<T>,
  prevValue: T,
  nextValue: T
): void {
  if (!isDefaultSelectorEquals(cell._equals)) {
    notifyAllSelectorSources(cell);
    return;
  }

  if (!Object.is(prevValue, nextValue)) {
    notifySelectorSource(getCandidateSource(cell, prevValue));
    notifySelectorSource(getCandidateSource(cell, nextValue));
  }
}

function recomputeSelectorCell<T>(
  cell: SelectorCell<T>,
  notifyDownstream: boolean
): T {
  if (!cell._dirty && cell._hasValue) {
    return cell._value;
  }

  if (cell._evaluating) {
    throw new Error('selector() cannot read itself recursively');
  }

  cell._evaluating = true;
  cell._dirty = false;
  cell._pendingDependencySources = new Set();

  const prevSources = cell._sources;
  const hadValue = cell._hasValue;
  const prevValue = cell._value;
  let nextValue: T;

  try {
    nextValue = withDerivedReadTracking(cell, cell._source);
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

  const valueChanged = !cell._hasValue || !cell._equals(prevValue, nextValue);
  cell._hasValue = true;
  cell._value = nextValue;

  if (valueChanged && notifyDownstream && hadValue) {
    notifySelectorValueChange(cell, prevValue, nextValue);
  }

  return cell._value;
}

function createSelectorCell<T>(
  instance: ComponentInstance,
  hookIndex: number,
  source: () => T,
  equals: SelectorEquals<T>
): SelectorCell<T> {
  const perfMetricsStore = getPerfMetricsStore();
  const cell = function selectorPredicate(candidate: T): boolean {
    const sourceRef = getCandidateSource(cell as SelectorCell<T>, candidate);
    recordReadableRead(sourceRef);
    if (perfMetricsStore) {
      perfMetricsStore.selectorCandidateReads += 1;
    }
    const selectorCell = cell as SelectorCell<T>;
    const current =
      selectorCell._dirty || !selectorCell._hasValue
        ? recomputeSelectorCell(selectorCell, selectorCell._scheduled)
        : selectorCell._value;
    return selectorCell._equals(current, candidate);
  } as SelectorCell<T>;

  cell._owner = instance;
  cell._hookIndex = hookIndex;
  cell._source = source;
  cell._equals = equals;
  cell._value = undefined as T;
  cell._hasValue = false;
  cell._dirty = true;
  cell._scheduled = false;
  cell._evaluating = false;
  cell._sources = new Set();
  cell._primitiveCandidates = new Map();
  cell._objectCandidates = new WeakMap();
  cell._objectCandidateSources = new Set();
  cell._markDirty = () => {
    markSelectorCellDirty(cell as unknown as SelectorCell<unknown>);
  };
  cell._cleanup = () => {
    cell._scheduled = false;
    cell._dirty = false;
    cell._hasValue = false;
    dirtySelectorCells.delete(cell as unknown as SelectorCell<unknown>);
    clearDerivedDependencySubscriptions(cell, cell._sources);
    for (const sourceRef of cell._primitiveCandidates.values()) {
      sourceRef._readers?.clear();
      sourceRef._derivedSubscribers?.clear();
    }
    for (const sourceRef of cell._objectCandidateSources) {
      sourceRef._readers?.clear();
      sourceRef._derivedSubscribers?.clear();
    }
    cell._primitiveCandidates.clear();
    cell._objectCandidateSources.clear();
  };

  (instance.cleanupFns ??= []).push(() => {
    cell._cleanup();
    selectorCells.get(instance)?.delete(hookIndex);
  });

  return cell;
}

function getOrCreateSelectorCell<T>(
  instance: ComponentInstance,
  hookIndex: number,
  source: () => T,
  equals: SelectorEquals<T>
): SelectorCell<T> {
  const store = getSelectorStore(instance);
  const existing = store.get(hookIndex) as SelectorCell<T> | undefined;
  if (existing) {
    existing._source = source;
    existing._equals = equals;
    existing._dirty = true;
    return existing;
  }

  const created = createSelectorCell(instance, hookIndex, source, equals);
  store.set(hookIndex, created as unknown as SelectorCell<unknown>);
  return created;
}

export function selector<T>(
  source: () => T,
  equals: SelectorEquals<T> = Object.is
): Selector<T> {
  markReadableUsage(source);

  const instance = getCurrentInstance();
  if (!instance) {
    throw new Error(
      'selector() can only be called during component render execution. ' +
        'Move selector() calls to the top level of your component function.'
    );
  }

  const hookIndex = claimHookIndex(instance, 'selector');
  const cell = getOrCreateSelectorCell(instance, hookIndex, source, equals);
  recomputeSelectorCell(cell, false);
  return cell;
}
