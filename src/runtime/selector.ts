import {
  claimHookIndex,
  getCurrentInstance,
  type ComponentInstance,
} from './component';
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
import {
  markDirtySelectorRecord,
  takeDirtySelectorRecords,
} from './selector-store';
import { adjustOwnershipDiagnostic } from './ownership-diagnostics';

declare const __ASKR_BENCH_BUILD__: boolean;
declare const __ASKR_DEVELOPMENT_BUILD__: boolean;

const PERF_BUILD_ENABLED = __ASKR_DEVELOPMENT_BUILD__ || __ASKR_BENCH_BUILD__;

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

const selectorCells = new WeakMap<object, Map<number, SelectorHook<unknown>>>();
const selectorRecords = new WeakMap<
  ReadableSource<unknown>,
  SelectorSourceRecord<unknown>
>();

function getSelectorStore(
  instance: ComponentInstance
): Map<number, SelectorHook<unknown>> {
  const generation = instance._ownershipGeneration;
  let store = selectorCells.get(generation);
  if (!store) {
    store = new Map();
    selectorCells.set(generation, store);
  }
  return store;
}

function markSelectorRecordDirty(record: SelectorSourceRecord<unknown>): void {
  markDirtySelectorRecord(record, flushDirtySelectorRecords);
}

function flushDirtySelectorRecords(): void {
  for (const record of takeDirtySelectorRecords<
    SelectorSourceRecord<unknown>
  >()) {
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
  // Candidate sources are identity/subscription records; unlike public
  // readables they are never invoked. Avoid allocating a closure per distinct
  // selector candidate (large keyed tables commonly create thousands).
  return { _candidate: candidate } as unknown as SelectorCandidateSource<T>;
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
        const readerCount = sourceRef._readers?.size ?? 0;
        sourceRef._readers?.clear();
        if (__ASKR_DEVELOPMENT_BUILD__ && readerCount > 0) {
          adjustOwnershipDiagnostic('readableReaders', -readerCount);
        }
        sourceRef._derivedSubscribers?.clear();
      }
      for (const sourceRef of lane._objectCandidateSources) {
        const readerCount = sourceRef._readers?.size ?? 0;
        sourceRef._readers?.clear();
        if (__ASKR_DEVELOPMENT_BUILD__ && readerCount > 0) {
          adjustOwnershipDiagnostic('readableReaders', -readerCount);
        }
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
  if (PERF_BUILD_ENABLED) {
    incrementPerfMetric('selectorInvalidations');
  }
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
  generation: object,
  store: Map<number, SelectorHook<unknown>>,
  hookIndex: number,
  source: () => T,
  equals: SelectorEquals<T>
): SelectorHook<T> {
  const hook = function selectorPredicate(candidate: T): boolean {
    const selectorHook = hook as SelectorHook<T>;
    const record =
      selectorHook._record ?? ensureSelectorHookBinding(selectorHook);
    const lane = selectorHook._lane;
    if (!lane) {
      throw new Error('selector() binding could not be established.');
    }

    const sourceRef = getCandidateSource(lane, candidate);
    recordReadableRead(sourceRef);

    if (PERF_BUILD_ENABLED) {
      const perfMetricsStore = getPerfMetricsStore();
      if (perfMetricsStore) {
        perfMetricsStore.selectorCandidateReads += 1;
      }
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
    store.delete(hookIndex);
    if (store.size === 0 && selectorCells.get(generation) === store) {
      selectorCells.delete(generation);
    }
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

  const created = createSelectorHook(
    instance,
    instance._ownershipGeneration,
    store,
    hookIndex,
    source,
    equals
  );
  store.set(hookIndex, created as unknown as SelectorHook<unknown>);
  return created;
}

/**
 * Creates a render-scoped predicate for keyed membership in reactive list rows.
 *
 * Use this when a `<For>` child needs to compare each stable item with a
 * changing selected value. Unlike a plain closure capture, the predicate
 * subscribes the affected rows and updates them without rebuilding the list.
 * Must be called during component render.
 */
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
