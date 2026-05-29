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

interface SelectorLane<T> {
  _record: SelectorSourceRecord<T>;
  _equals: SelectorEquals<T>;
  _bindingCount: number;
  _primitiveCandidates: Map<PrimitiveKey, SelectorCandidateSource<T>>;
  _objectCandidates: WeakMap<object, SelectorCandidateSource<T>>;
  _objectCandidateSources: Set<SelectorCandidateSource<T>>;
  _cleanup(): void;
}

interface SelectorSourceRecord<T> extends DerivedSubscriber {
  _source: () => T;
  _value: T;
  _hasValue: boolean;
  _dirty: boolean;
  _scheduled: boolean;
  _evaluating: boolean;
  _sources: Set<ReadableSource<unknown>>;
  _pendingDependencySources?: Set<ReadableSource<unknown>>;
  _lanes: Map<SelectorEquals<T>, SelectorLane<T>>;
  _cleanup(): void;
}

interface SelectorHook<T> extends Selector<T> {
  _owner: ComponentInstance;
  _hookIndex: number;
  _source: () => T;
  _equals: SelectorEquals<T>;
  _record: SelectorSourceRecord<T> | null;
  _lane: SelectorLane<T> | null;
  _cleanup(): void;
}

const selectorCells = new WeakMap<
  ComponentInstance,
  Map<number, SelectorHook<unknown>>
>();
const selectorRecords = new WeakMap<
  ReadableSource<unknown>,
  SelectorSourceRecord<unknown>
>();
const dirtySelectorRecords = new Set<SelectorSourceRecord<unknown>>();
let hasPendingSelectorFlush = false;

function getSelectorStore(
  instance: ComponentInstance
): Map<number, SelectorHook<unknown>> {
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
  globalScheduler.enqueueInLane('derived', flushDirtySelectorRecords);
}

function markSelectorRecordDirty(record: SelectorSourceRecord<unknown>): void {
  record._dirty = true;
  if (record._scheduled) {
    return;
  }

  record._scheduled = true;
  dirtySelectorRecords.add(record);
  scheduleSelectorFlush();
}

function flushDirtySelectorRecords(): void {
  hasPendingSelectorFlush = false;

  if (dirtySelectorRecords.size === 0) {
    return;
  }

  const pending = Array.from(dirtySelectorRecords);
  dirtySelectorRecords.clear();

  for (const record of pending) {
    record._scheduled = false;
    if (!record._dirty) {
      continue;
    }
    recomputeSelectorSourceRecord(record, true);
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
  lane: SelectorLane<T>,
  candidate: T
): SelectorCandidateSource<T> {
  if (isObjectCandidate(candidate)) {
    const cached = lane._objectCandidates.get(candidate);
    if (cached) {
      return cached;
    }

    const created = createCandidateSource(candidate);
    lane._objectCandidates.set(candidate, created);
    lane._objectCandidateSources.add(created);
    return created;
  }

  const key = candidate as PrimitiveKey;
  const cached = lane._primitiveCandidates.get(key);
  if (cached) {
    return cached;
  }

  const created = createCandidateSource(candidate);
  lane._primitiveCandidates.set(key, created);
  return created;
}

function peekCandidateSource<T>(
  lane: SelectorLane<T>,
  candidate: T
): SelectorCandidateSource<T> | undefined {
  if (isObjectCandidate(candidate)) {
    return lane._objectCandidates.get(candidate);
  }
  return lane._primitiveCandidates.get(candidate as PrimitiveKey);
}

function getSelectorSourceRecord<T>(source: () => T): SelectorSourceRecord<T> {
  const cached = selectorRecords.get(source);
  if (cached) {
    return cached as SelectorSourceRecord<T>;
  }

  const record = createSelectorSourceRecord(source);
  selectorRecords.set(source, record as SelectorSourceRecord<unknown>);
  return record;
}

function createSelectorSourceRecord<T>(
  source: () => T
): SelectorSourceRecord<T> {
  let record!: SelectorSourceRecord<T>;

  record = {
    _source: source,
    _value: undefined as T,
    _hasValue: false,
    _dirty: true,
    _scheduled: false,
    _evaluating: false,
    _sources: new Set(),
    _lanes: new Map(),
    _markDirty: () => {
      markSelectorRecordDirty(record as SelectorSourceRecord<unknown>);
    },
    _cleanup: () => {
      record._scheduled = false;
      record._dirty = false;
      record._hasValue = false;
      record._evaluating = false;
      record._pendingDependencySources = undefined;
      clearDerivedDependencySubscriptions(record, record._sources);
      record._lanes.clear();
      selectorRecords.delete(source as ReadableSource<unknown>);
    },
  };

  return record;
}

function getSelectorLane<T>(
  record: SelectorSourceRecord<T>,
  equals: SelectorEquals<T>
): SelectorLane<T> {
  const cached = record._lanes.get(equals);
  if (cached) {
    return cached;
  }

  const lane = createSelectorLane(record, equals);
  record._lanes.set(equals, lane);
  return lane;
}

function createSelectorLane<T>(
  record: SelectorSourceRecord<T>,
  equals: SelectorEquals<T>
): SelectorLane<T> {
  const lane: SelectorLane<T> = {
    _record: record,
    _equals: equals,
    _bindingCount: 0,
    _primitiveCandidates: new Map(),
    _objectCandidates: new WeakMap(),
    _objectCandidateSources: new Set(),
    _cleanup: () => {
      for (const sourceRef of lane._primitiveCandidates.values()) {
        sourceRef._readers?.clear();
        sourceRef._derivedSubscribers?.clear();
      }
      for (const sourceRef of lane._objectCandidateSources) {
        sourceRef._readers?.clear();
        sourceRef._derivedSubscribers?.clear();
      }
      lane._primitiveCandidates.clear();
      lane._objectCandidates = new WeakMap();
      lane._objectCandidateSources.clear();
    },
  };

  return lane;
}

function notifySelectorSource(source: SelectorCandidateSource<unknown>): void {
  incrementPerfMetric('selectorInvalidations');
  markReadableDerivedSubscribersDirty(source);
  markReactivePropsDirtySource(source);
  notifyReadableReaders(source);
}

function notifyAllSelectorSources<T>(lane: SelectorLane<T>): void {
  for (const source of lane._primitiveCandidates.values()) {
    notifySelectorSource(source);
  }
  for (const source of lane._objectCandidateSources) {
    notifySelectorSource(source);
  }
}

function notifySelectorLaneValueChange<T>(
  lane: SelectorLane<T>,
  prevValue: T,
  nextValue: T
): void {
  if (!lane._bindingCount) {
    return;
  }

  if (!isDefaultSelectorEquals(lane._equals)) {
    if (lane._equals(prevValue, nextValue)) {
      return;
    }
    notifyAllSelectorSources(lane);
    return;
  }

  if (!Object.is(prevValue, nextValue)) {
    // Only notify candidate sources that were actually materialized by a read.
    // Using getCandidateSource here would create-on-miss and leak a candidate
    // source for every distinct value the source ever passed through, even
    // those no component reads. Peek instead so the candidate cache stays
    // bounded to values that components actually compare against.
    const prevSource = peekCandidateSource(lane, prevValue);
    if (prevSource) {
      notifySelectorSource(prevSource);
    }
    const nextSource = peekCandidateSource(lane, nextValue);
    if (nextSource) {
      notifySelectorSource(nextSource);
    }
  }
}

function recomputeSelectorSourceRecord<T>(
  record: SelectorSourceRecord<T>,
  notifyDownstream: boolean
): T {
  if (!record._dirty && record._hasValue) {
    return record._value;
  }

  if (record._evaluating) {
    throw new Error('selector() cannot read itself recursively');
  }

  record._evaluating = true;
  record._dirty = false;
  record._pendingDependencySources = new Set();

  const prevSources = record._sources;
  const hadValue = record._hasValue;
  const prevValue = record._value;
  let nextValue: T;

  try {
    nextValue = withDerivedReadTracking(record, record._source);
  } catch (error) {
    record._dirty = true;
    record._pendingDependencySources = undefined;
    throw error;
  } finally {
    record._evaluating = false;
  }

  const nextSources = record._pendingDependencySources ?? new Set();
  record._pendingDependencySources = undefined;
  syncDerivedDependencySubscriptions(record, prevSources, nextSources);
  record._sources = nextSources;

  const valueChanged = !record._hasValue || !Object.is(prevValue, nextValue);
  record._hasValue = true;
  record._value = nextValue;

  if (valueChanged && notifyDownstream && hadValue) {
    for (const lane of Array.from(record._lanes.values())) {
      notifySelectorLaneValueChange(lane, prevValue, nextValue);
    }
  }

  return record._value;
}

function attachSelectorHookBinding<T>(
  hook: SelectorHook<T>,
  source: () => T,
  equals: SelectorEquals<T>
): void {
  const record = getSelectorSourceRecord(source);
  const lane = getSelectorLane(record, equals);

  hook._source = source;
  hook._equals = equals;
  hook._record = record;
  hook._lane = lane;
  lane._bindingCount += 1;
}

function detachSelectorHookBinding<T>(hook: SelectorHook<T>): void {
  const record = hook._record;
  const lane = hook._lane;

  hook._record = null;
  hook._lane = null;

  if (!record || !lane) {
    return;
  }

  if (lane._bindingCount > 0) {
    lane._bindingCount -= 1;
  }

  if (lane._bindingCount > 0) {
    return;
  }

  lane._cleanup();
  record._lanes.delete(lane._equals);

  if (record._lanes.size === 0) {
    record._cleanup();
  }
}

function ensureSelectorHookBinding<T>(
  hook: SelectorHook<T>
): SelectorSourceRecord<T> {
  const record = hook._record;
  const lane = hook._lane;

  if (
    record &&
    lane &&
    lane._bindingCount > 0 &&
    record._lanes.get(hook._equals) === lane &&
    record._source === hook._source
  ) {
    return record;
  }

  if (hook._record || hook._lane) {
    detachSelectorHookBinding(hook);
  }

  attachSelectorHookBinding(hook, hook._source, hook._equals);
  return hook._record!;
}

function createSelectorHook<T>(
  instance: ComponentInstance,
  hookIndex: number,
  source: () => T,
  equals: SelectorEquals<T>
): SelectorHook<T> {
  const hook = function selectorPredicate(candidate: T): boolean {
    const selectorHook = hook as SelectorHook<T>;
    const record = ensureSelectorHookBinding(selectorHook);
    const lane = selectorHook._lane;
    if (!lane) {
      throw new Error('selector() binding could not be established.');
    }

    const sourceRef = getCandidateSource(lane, candidate);
    recordReadableRead(sourceRef);

    const perfMetricsStore = getPerfMetricsStore();
    if (perfMetricsStore) {
      perfMetricsStore.selectorCandidateReads += 1;
    }

    const current =
      record._dirty || !record._hasValue
        ? recomputeSelectorSourceRecord(record, record._scheduled)
        : record._value;

    return lane._equals(current, candidate);
  } as SelectorHook<T>;

  hook._owner = instance;
  hook._hookIndex = hookIndex;
  hook._source = source;
  hook._equals = equals;
  hook._record = null;
  hook._lane = null;
  hook._cleanup = () => {
    detachSelectorHookBinding(hook);
  };

  attachSelectorHookBinding(hook, source, equals);

  (instance.cleanupFns ??= []).push(() => {
    hook._cleanup();
    selectorCells.get(instance)?.delete(hookIndex);
  });

  return hook;
}

function getOrCreateSelectorHook<T>(
  instance: ComponentInstance,
  hookIndex: number,
  source: () => T,
  equals: SelectorEquals<T>
): SelectorHook<T> {
  const store = getSelectorStore(instance);
  const existing = store.get(hookIndex) as SelectorHook<T> | undefined;
  if (existing) {
    if (existing._source !== source || existing._equals !== equals) {
      detachSelectorHookBinding(existing);
      attachSelectorHookBinding(existing, source, equals);
    } else {
      ensureSelectorHookBinding(existing);
    }
    return existing;
  }

  const created = createSelectorHook(instance, hookIndex, source, equals);
  store.set(hookIndex, created as unknown as SelectorHook<unknown>);
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
  const hook = getOrCreateSelectorHook(instance, hookIndex, source, equals);
  if (!hook._record) {
    throw new Error('selector() record binding was not established.');
  }

  if (!hook._record._hasValue) {
    // Initialize the shared source once so downstream selectors can subscribe,
    // but do not consume a pending dirty state on later renders.
    recomputeSelectorSourceRecord(hook._record, false);
  }
  return hook;
}
