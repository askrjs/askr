import { invalidatePendingChecks, ownCleanup } from '../ownership/record';
import { notifyReadableSource } from './notify';
import {
  claimHookIndex,
  getCurrentComponentInstance,
  peekCurrentComponentInstance,
} from '../component/scope';
import { type ComponentInstance } from '../component/instance';
import {
  clearDerivedDependencySubscriptions,
  markReadableUsage,
  recordReadableRead,
  syncDerivedDependencySubscriptions,
  withDerivedReadTracking,
  type DerivedSubscriber,
  type ReadableSource,
} from './readable';
import {
  getPerfMetricsStore,
  incrementPerfMetric,
} from '../diagnostics/perf-metrics';
import {
  markDirtySelectorRecord,
  takeDirtySelectorRecords,
} from './selector-store';
import { adjustOwnershipDiagnostic } from '../diagnostics/ownership-diagnostics';
import { getRuntimeScheduler } from '../access';
import { createFlushLoopGuard } from '../flush-loop-guard';
import {
  deferBehindPendingRender,
  hasPendingOwnerRender,
} from '../component/pending-render';

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

/** A fine-grained reactive membership check produced by {@link selector}. */
export interface Selector<T> {
  (candidate: T): boolean;
}

interface SelectorCandidateSource<T> extends ReadableSource<boolean> {
  _candidate: T;
  /** The shared source record, so a stale record shows through (#523). */
  _record: SelectorSourceRecord<T>;
}

type SelectorEquals<T> = {
  bivarianceHack(a: T, b: T): boolean;
}['bivarianceHack'];

interface SelectorEqualityGroup<T> {
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
  _pending: boolean;
  _evaluating: boolean;
  _sources: Set<ReadableSource<unknown>>;
  _pendingDependencySources?: Set<ReadableSource<unknown>>;
  _equalityGroups: Map<SelectorEquals<T>, SelectorEqualityGroup<T>>;
  /**
   * The component whose hook last bound this record. Only a render closure can
   * read stale props, and a closure belongs to one owner; a record shared by
   * several hooks has a stable source function (#523).
   */
  _owner?: ComponentInstance;
  _cleanup(): void;
}

interface SelectorHook<T> extends Selector<T> {
  _owner: ComponentInstance;
  _hookIndex: number;
  _source: () => T;
  _equals: SelectorEquals<T>;
  _record: SelectorSourceRecord<T> | null;
  _equalityGroup: SelectorEqualityGroup<T> | null;
  _active: boolean;
  _disposedValue: T;
  _hasDisposedValue: boolean;
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
  const generation = instance.owner.identity;
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

const selectorLoopGuard =
  createFlushLoopGuard<SelectorSourceRecord<unknown>>('selector()');

function flushDirtySelectorRecords(): void {
  const scheduler = getRuntimeScheduler();
  let failures: unknown[] | null = null;
  invalidatePendingChecks();
  for (const record of takeDirtySelectorRecords<
    SelectorSourceRecord<unknown>
  >()) {
    record._pending = false;
    if (!record._dirty) {
      continue;
    }
    // A queued ancestor render or boundary reconcile decides whether the
    // owner survives and with which props (#523).
    if (record._owner && hasPendingOwnerRender(record._owner)) {
      deferBehindPendingRender(record);
      continue;
    }
    // Skip a looping record; it stays dirty and recomputes on its next read.
    const loop = selectorLoopGuard(scheduler, record);
    if (loop) {
      if (loop !== true) (failures ??= []).push(loop);
      continue;
    }
    try {
      recomputeSelectorSourceRecord(record, true);
    } catch (error) {
      (failures ??= []).push(error);
    }
  }

  if (failures?.length === 1) {
    throw failures[0];
  }
  if (failures && failures.length > 1) {
    throw new AggregateError(failures, 'selector() recompute failures');
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

function createCandidateSource<T>(
  group: SelectorEqualityGroup<T>,
  candidate: T
): SelectorCandidateSource<T> {
  // Candidate sources are identity/subscription records; unlike public
  // readables they are never invoked. Avoid allocating a closure per distinct
  // selector candidate (large keyed tables commonly create thousands).
  return {
    _candidate: candidate,
    _record: group._record,
  } as unknown as SelectorCandidateSource<T>;
}

function getCandidateSource<T>(
  group: SelectorEqualityGroup<T>,
  candidate: T
): SelectorCandidateSource<T> {
  if (isObjectCandidate(candidate)) {
    const cached = group._objectCandidates.get(candidate);
    if (cached) {
      return cached;
    }

    const created = createCandidateSource(group, candidate);
    group._objectCandidates.set(candidate, created);
    group._objectCandidateSources.add(created);
    return created;
  }

  const key = candidate as PrimitiveKey;
  const cached = group._primitiveCandidates.get(key);
  if (cached) {
    return cached;
  }

  const created = createCandidateSource(group, candidate);
  group._primitiveCandidates.set(key, created);
  return created;
}

function peekCandidateSource<T>(
  group: SelectorEqualityGroup<T>,
  candidate: T
): SelectorCandidateSource<T> | undefined {
  if (isObjectCandidate(candidate)) {
    return group._objectCandidates.get(candidate);
  }
  return group._primitiveCandidates.get(candidate as PrimitiveKey);
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
    _pending: false,
    _evaluating: false,
    _sources: new Set(),
    _equalityGroups: new Map(),
    _markDirty: () => {
      markSelectorRecordDirty(record as SelectorSourceRecord<unknown>);
    },
    _cleanup: () => {
      record._pending = false;
      record._dirty = false;
      record._hasValue = false;
      record._evaluating = false;
      record._pendingDependencySources = undefined;
      clearDerivedDependencySubscriptions(record, record._sources);
      record._equalityGroups.clear();
      selectorRecords.delete(source as ReadableSource<unknown>);
    },
  };

  return record;
}

function getSelectorEqualityGroup<T>(
  record: SelectorSourceRecord<T>,
  equals: SelectorEquals<T>
): SelectorEqualityGroup<T> {
  const cached = record._equalityGroups.get(equals);
  if (cached) {
    return cached;
  }

  const group = createSelectorEqualityGroup(record, equals);
  record._equalityGroups.set(equals, group);
  return group;
}

function createSelectorEqualityGroup<T>(
  record: SelectorSourceRecord<T>,
  equals: SelectorEquals<T>
): SelectorEqualityGroup<T> {
  const group: SelectorEqualityGroup<T> = {
    _record: record,
    _equals: equals,
    _bindingCount: 0,
    _primitiveCandidates: new Map(),
    _objectCandidates: new WeakMap(),
    _objectCandidateSources: new Set(),
    _cleanup: () => {
      for (const sourceRef of group._primitiveCandidates.values()) {
        const readerCount = sourceRef._readers?.size ?? 0;
        sourceRef._readers?.clear();
        if (__ASKR_DEVELOPMENT_BUILD__ && readerCount > 0) {
          adjustOwnershipDiagnostic('readableReaders', -readerCount);
        }
        sourceRef._derivedSubscribers?.clear();
      }
      for (const sourceRef of group._objectCandidateSources) {
        const readerCount = sourceRef._readers?.size ?? 0;
        sourceRef._readers?.clear();
        if (__ASKR_DEVELOPMENT_BUILD__ && readerCount > 0) {
          adjustOwnershipDiagnostic('readableReaders', -readerCount);
        }
        sourceRef._derivedSubscribers?.clear();
      }
      group._primitiveCandidates.clear();
      group._objectCandidates = new WeakMap();
      group._objectCandidateSources.clear();
    },
  };

  return group;
}

function notifySelectorSource(source: SelectorCandidateSource<unknown>): void {
  if (PERF_BUILD_ENABLED) {
    incrementPerfMetric('selectorInvalidations');
  }
  // The component currently rendering reads the new value directly.
  notifyReadableSource(source, {
    skipCurrentDerivedSubscriber: true,
    skipInstance: peekCurrentComponentInstance(),
  });
}

function notifyAllSelectorSources<T>(group: SelectorEqualityGroup<T>): void {
  for (const source of group._primitiveCandidates.values()) {
    notifySelectorSource(source);
  }
  for (const source of group._objectCandidateSources) {
    notifySelectorSource(source);
  }
}

function notifySelectorEqualityGroupValueChange<T>(
  group: SelectorEqualityGroup<T>,
  prevValue: T,
  nextValue: T
): void {
  if (!group._bindingCount) {
    return;
  }

  if (!isDefaultSelectorEquals(group._equals)) {
    if (group._equals(prevValue, nextValue)) {
      return;
    }
    notifyAllSelectorSources(group);
    return;
  }

  if (!Object.is(prevValue, nextValue)) {
    // Only notify candidate sources that were actually materialized by a read.
    // Using getCandidateSource here would create-on-miss and leak a candidate
    // source for every distinct value the source ever passed through, even
    // those no component reads. Peek instead so the candidate cache stays
    // bounded to values that components actually compare against.
    const prevSource = peekCandidateSource(group, prevValue);
    if (prevSource) {
      notifySelectorSource(prevSource);
    }
    const nextSource = peekCandidateSource(group, nextValue);
    if (nextSource) {
      notifySelectorSource(nextSource);
    }
  }
}

function recomputeSelectorSourceRecord<T>(
  record: SelectorSourceRecord<T>,
  notifyDownstream: boolean
): T {
  if (record._evaluating) {
    throw new Error('selector() cannot read itself recursively');
  }

  if (!record._dirty && record._hasValue) {
    return record._value;
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
    for (const group of Array.from(record._equalityGroups.values())) {
      notifySelectorEqualityGroupValueChange(group, prevValue, nextValue);
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
  const group = getSelectorEqualityGroup(record, equals);

  hook._source = source;
  hook._equals = equals;
  hook._record = record;
  hook._equalityGroup = group;
  group._bindingCount += 1;
  record._owner = hook._owner;
}

function detachSelectorHookBinding<T>(hook: SelectorHook<T>): void {
  const record = hook._record;
  const group = hook._equalityGroup;

  hook._record = null;
  hook._equalityGroup = null;

  if (!record || !group) {
    return;
  }

  if (group._bindingCount > 0) {
    group._bindingCount -= 1;
  }

  if (group._bindingCount > 0) {
    return;
  }

  group._cleanup();
  record._equalityGroups.delete(group._equals);

  if (record._equalityGroups.size === 0) {
    record._cleanup();
  }
}

function ensureSelectorHookBinding<T>(
  hook: SelectorHook<T>
): SelectorSourceRecord<T> {
  const record = hook._record;
  const group = hook._equalityGroup;

  if (
    record &&
    group &&
    group._bindingCount > 0 &&
    record._equalityGroups.get(hook._equals) === group &&
    record._source === hook._source
  ) {
    return record;
  }

  if (hook._record || hook._equalityGroup) {
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
    if (!selectorHook._active) {
      if (__ASKR_DEVELOPMENT_BUILD__) {
        throw new Error(
          '[Askr] selector() was called after its owning component was disposed.'
        );
      }
      return (
        selectorHook._hasDisposedValue &&
        selectorHook._equals(selectorHook._disposedValue, candidate)
      );
    }

    const record =
      selectorHook._record ?? ensureSelectorHookBinding(selectorHook);
    const group = selectorHook._equalityGroup;
    if (!group) {
      throw new Error('selector() binding could not be established.');
    }

    const sourceRef = getCandidateSource(group, candidate);
    recordReadableRead(sourceRef);

    if (record._evaluating) {
      throw new Error('selector() cannot read itself recursively');
    }

    if (PERF_BUILD_ENABLED) {
      const perfMetricsStore = getPerfMetricsStore();
      if (perfMetricsStore) {
        perfMetricsStore.selectorCandidateReads += 1;
      }
    }

    const current =
      record._dirty || !record._hasValue
        ? recomputeSelectorSourceRecord(record, record._pending)
        : record._value;

    return group._equals(current, candidate);
  } as SelectorHook<T>;

  hook._owner = instance;
  hook._hookIndex = hookIndex;
  hook._source = source;
  hook._equals = equals;
  hook._record = null;
  hook._equalityGroup = null;
  hook._active = true;
  hook._disposedValue = undefined as T;
  hook._hasDisposedValue = false;
  hook._cleanup = () => {
    if (!hook._active) {
      return;
    }
    if (hook._record?._hasValue) {
      hook._disposedValue = hook._record._value;
      hook._hasDisposedValue = true;
    }
    hook._active = false;
    detachSelectorHookBinding(hook);
  };

  attachSelectorHookBinding(hook, source, equals);

  ownCleanup(instance.owner, () => {
    try {
      hook._cleanup();
    } finally {
      store.delete(hookIndex);
      if (store.size === 0 && selectorCells.get(generation) === store) {
        selectorCells.delete(generation);
      }
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
      if (
        existing._equals === equals &&
        existing._record &&
        existing._equalityGroup
      ) {
        const record = existing._record;
        selectorRecords.delete(record._source);
        record._source = source;
        selectorRecords.set(source, record);
        existing._source = source;
        record._dirty = true;
        // Rows that are not re-rendered by this render still read the old
        // value, so a change here has to be published (#431).
        recomputeSelectorSourceRecord(record, true);
        ensureSelectorHookBinding(existing);
      } else {
        detachSelectorHookBinding(existing);
        attachSelectorHookBinding(existing, source, equals);
      }
    } else {
      ensureSelectorHookBinding(existing);
    }
    return existing;
  }

  const created = createSelectorHook(
    instance,
    instance.owner.identity,
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

  const instance = getCurrentComponentInstance();
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
