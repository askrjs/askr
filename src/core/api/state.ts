/**
 * Public reactive primitives: state(), derive(), selector().
 */

import {
  claimHook,
  getCurrentInstance,
  requireInstance,
  type ComponentInstance,
} from '../component/instance';
import {
  Computation,
  Signal,
  getTrackingComputation,
  notifySource,
  trackSource,
  type Source,
} from '../reactive/graph';
import { effectScheduler, getFlushVersion } from '../reactive/scheduler';
import { isRendering } from '../component/render-state';
import { isSnapshotSource } from './snapshot';

export interface State<T> {
  (): T;
  set(...args: StateSetterArgs<T>): void;
  [Symbol.iterator](): IterableIterator<StateTuple<T>[number]>;
}

type StateUpdater<T> = (prev: T) => T;

type StateSetterArgs<T> = [Extract<T, (...args: any[]) => unknown>] extends [
  never,
]
  ? [value: T] | [updater: StateUpdater<T>]
  : [updater: StateUpdater<T>];

export type StateSetter<T> = (...args: StateSetterArgs<T>) => void;
export type StateTuple<T> = [get: State<T>, set: StateSetter<T>] & State<T>;

/** A derived computation is running: writes would loop. */
function isDerivedComputationActive(): boolean {
  const running = getTrackingComputation();
  return (
    running !== null && (running as { _derived?: boolean })._derived === true
  );
}

/** Create a callable state cell backed by `signal`. */
export function createStateCell<T>(signal: Signal<T>): StateTuple<T> {
  const read = (() => signal.read()) as State<T> & {
    _signal: Signal<T>;
  };
  read._signal = signal;
  const set = (valueOrUpdater: T | ((prev: T) => T)): void => {
    if (isRendering() && !isDerivedComputationActive()) {
      throw new Error(
        '[Askr] state.set() cannot be called during component render. ' +
          'A write during render would schedule another render of the same component and could loop forever. ' +
          'Move state updates to event handlers or use conditional rendering instead.'
      );
    }
    const next =
      typeof valueOrUpdater === 'function'
        ? (valueOrUpdater as (prev: T) => T)(signal.peek())
        : valueOrUpdater;
    if (Object.is(signal.peek(), next)) return;
    if (isDerivedComputationActive()) {
      throw new Error(
        '[Askr] state.set() cannot be called inside a derive() or selector() computation. ' +
          'Derived computations must be pure; a write from one can re-trigger it in an update loop. ' +
          'Move the state update to an event handler.'
      );
    }
    signal.write(next);
  };
  read.set = set as State<T>['set'];
  (read as unknown as { [Symbol.iterator]: () => Iterator<unknown> })[
    Symbol.iterator
  ] = function* () {
    yield read;
    yield set;
  };
  return read as unknown as StateTuple<T>;
}

export function state<T>(initialValue: T): StateTuple<T> {
  const instance = requireInstance('state()');
  const index = claimHook(instance, 'state');
  const existing = instance.hooks[index] as StateTuple<T> | undefined;
  if (existing) return existing;
  const cell = createStateCell(new Signal(initialValue));
  instance.hooks[index] = cell;
  return cell;
}

// ---------------------------------------------------------------------------
// derive()

export interface Derived<T> {
  (): T;
}

type SnapshotSource<T> = {
  value: T | null;
  pending?: boolean;
  error?: Error | null;
};

interface DeriveSlot {
  computation: Computation<unknown>;
  read: Derived<unknown>;
  setCompute(fn: () => unknown): void;
}

const MAX_DERIVED_RUNS = 50;

function mapped<TIn, TOut>(
  source: SnapshotSource<TIn> | TIn | (() => TIn),
  map: (value: TIn) => TOut
): () => TOut | null {
  return () => {
    let value: TIn;
    if (typeof source === 'function') {
      value = (source as () => TIn)();
    } else if (isSnapshotSource(source)) {
      const snapshot = source as unknown as SnapshotSource<TIn>;
      if (snapshot.pending) return null;
      value = snapshot.value as TIn;
    } else {
      value = source as TIn;
    }
    if (value == null) return null;
    return map(value);
  };
}

export function derive<TOut>(fn: () => TOut): Derived<TOut>;
export function derive<TIn, TOut>(
  source: SnapshotSource<TIn> | TIn | (() => TIn),
  map: (value: TIn) => TOut
): Derived<TOut | null>;
export function derive<TIn, TOut>(
  source: SnapshotSource<TIn> | TIn | (() => TIn),
  map?: (value: TIn) => TOut
): Derived<unknown> {
  const instance = requireInstance('derive()');
  const index = claimHook(instance, 'derive');
  const compute =
    map === undefined ? (source as () => unknown) : mapped(source, map);
  let slot = instance.hooks[index] as DeriveSlot | undefined;
  if (!slot) {
    slot = createDerived(instance, compute, 'derive()');
    instance.hooks[index] = slot;
  } else {
    // A new render may capture new locals; the next read recomputes.
    slot.setCompute(compute);
  }
  return slot.read;
}

function createDerived(
  owner: ComponentInstance | null,
  compute: () => unknown,
  label: string
): DeriveSlot {
  let current = compute;
  let runs = 0;
  let runsFlush = -1;
  const computation = new Computation<unknown>(
    owner,
    () => {
      const flush = getFlushVersion();
      if (flush !== runsFlush) {
        runsFlush = flush;
        runs = 0;
      }
      if (++runs > MAX_DERIVED_RUNS) {
        throw new Error(`[Askr] ${label} exceeded ${MAX_DERIVED_RUNS} runs`);
      }
      return current();
    },
    null
  );
  (computation as { _derived?: boolean })._derived = true;
  return {
    computation,
    read: (() => computation.read()) as Derived<unknown>,
    setCompute(fn) {
      current = fn;
      computation.invalidate();
    },
  };
}

// ---------------------------------------------------------------------------
// selector()

export interface Selector<T> {
  (candidate: T): boolean;
}

type SelectorEquals<T> = (a: T, b: T) => boolean;

interface CandidateSource extends Source {
  candidate: unknown;
}

interface SelectorSlot<T> {
  predicate: Selector<T>;
  setSource(source: () => T, equals: SelectorEquals<T>): void;
}

export function selector<T>(
  source: () => T,
  equals: SelectorEquals<T> = Object.is
): Selector<T> {
  const instance = requireInstance('selector()');
  const index = claimHook(instance, 'selector');
  let slot = instance.hooks[index] as SelectorSlot<T> | undefined;
  if (!slot) {
    slot = createSelector(instance, source, equals);
    instance.hooks[index] = slot;
  } else {
    slot.setSource(source, equals);
  }
  return slot.predicate;
}

function createSelector<T>(
  owner: ComponentInstance,
  initialSource: () => T,
  initialEquals: SelectorEquals<T>
): SelectorSlot<T> {
  let source = initialSource;
  let equals = initialEquals;
  let value: T;
  let hasValue = false;
  const primitives = new Map<unknown, CandidateSource>();
  const objects = new WeakMap<object, CandidateSource>();

  const candidateSource = (candidate: unknown, create: boolean) => {
    const isObject =
      (typeof candidate === 'object' && candidate !== null) ||
      typeof candidate === 'function';
    let entry = isObject
      ? objects.get(candidate as object)
      : primitives.get(candidate);
    if (!entry && create) {
      entry = { _observers: null, candidate };
      if (isObject) objects.set(candidate as object, entry);
      else primitives.set(candidate, entry);
    }
    return entry;
  };

  const notifyChange = (previous: T, next: T) => {
    if (equals !== Object.is) {
      if (equals(previous, next)) return;
      for (const entry of primitives.values()) notifySource(entry);
      // Object candidates are only reachable through the WeakMap; readers
      // re-check on their own next read, so notify the watcher instead.
      notifySource(allObjects);
      return;
    }
    const a = candidateSource(previous, false);
    if (a) notifySource(a);
    const b = candidateSource(next, false);
    if (b) notifySource(b);
  };
  const allObjects: Source = { _observers: null };

  const watcher = new Computation<void>(
    owner,
    () => {
      const next = source();
      if (hasValue && !Object.is(value, next)) {
        const previous = value;
        value = next;
        notifyChange(previous, next);
      } else {
        value = next;
        hasValue = true;
      }
    },
    effectScheduler('render', owner.depth),
    null
  );
  (watcher as { _derived?: boolean })._derived = true;
  watcher.run();

  const predicate = ((candidate: T) => {
    const entry = candidateSource(candidate, true)!;
    trackSource(entry);
    if (equals !== Object.is) trackSource(allObjects);
    if (watcher.stale) watcher.update();
    return equals(value, candidate);
  }) as Selector<T>;

  return {
    predicate,
    setSource(nextSource, nextEquals) {
      equals = nextEquals;
      if (nextSource !== source) {
        source = nextSource;
        watcher.invalidate();
        watcher.update();
      }
    },
  };
}

// ---------------------------------------------------------------------------
// getSignal()

export function getSignal(): AbortSignal {
  const instance = getCurrentInstance();
  if (!instance) {
    throw new Error(
      'getSignal() can only be called during component render execution.'
    );
  }
  return instance.signal;
}
