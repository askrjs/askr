/**
 * Reactive graph.
 *
 * Sources hold values; computations derive values or perform effects from
 * the sources they read. A write marks direct observers DIRTY and everything
 * downstream of them CHECK. A computation that is read (or run by the
 * scheduler) first brings its CHECK sources up to date and only re-runs if
 * one of them actually changed, so updates are glitch-free and unchanged
 * derived values cut propagation off.
 *
 * There is one subscriber kind. `derive()`, `selector()`, fine-grained
 * bindings, `watch()`, and component renders are all computations; they
 * differ only in how they are scheduled when they go stale.
 */

import { Owner } from './owner';

const CLEAN = 0;
const CHECK = 1;
const DIRTY = 2;
type NodeState = typeof CLEAN | typeof CHECK | typeof DIRTY;

export interface Source {
  _observers: Set<Computation> | null;
}

export type Equals<T> = (a: T, b: T) => boolean;

let tracking: Computation | null = null;
let trackingSources: Set<Source> | null = null;

function track(source: Source): void {
  if (trackingSources) trackingSources.add(source);
}

/** Notify every observer of `source` that its value changed. */
export function notifySource(source: Source): void {
  const observers = source._observers;
  if (!observers) return;
  for (const observer of observers) observer._mark(DIRTY);
}

/** Record a read of `source` by the running computation. */
export function trackSource(source: Source): void {
  track(source);
}

export function isTracking(): boolean {
  return trackingSources !== null;
}

export function getTrackingComputation(): Computation | null {
  return tracking;
}

export function untrack<T>(fn: () => T): T {
  const previous = tracking;
  const previousSources = trackingSources;
  tracking = null;
  trackingSources = null;
  try {
    return fn();
  } finally {
    tracking = previous;
    trackingSources = previousSources;
  }
}

export class Signal<T> implements Source {
  _observers: Set<Computation> | null = null;
  _value: T;
  readonly _equals: Equals<T>;

  constructor(value: T, equals: Equals<T> = Object.is) {
    this._value = value;
    this._equals = equals;
  }

  read(): T {
    track(this);
    return this._value;
  }

  peek(): T {
    return this._value;
  }

  /** Returns true when the value changed and observers were notified. */
  write(value: T): boolean {
    if (this._equals(this._value, value)) return false;
    this._value = value;
    notifySource(this);
    return true;
  }
}

export type Scheduler = (computation: Computation) => void;

export class Computation<T = unknown> extends Owner implements Source {
  _observers: Set<Computation> | null = null;
  _sources: Set<Source> | null = null;
  _state: NodeState = DIRTY;
  _fn: () => T;
  _value: T | undefined = undefined;
  _error: unknown = undefined;
  _hasError = false;
  _running = false;
  readonly _equals: Equals<T> | null;
  /** How this computation reacts to going stale; null for lazily read values. */
  _schedule: Scheduler | null;

  constructor(
    owner: Owner | null,
    fn: () => T,
    schedule: Scheduler | null,
    equals: Equals<T> | null = Object.is
  ) {
    super(owner);
    this._fn = fn;
    this._schedule = schedule;
    this._equals = equals;
  }

  /** Read the current value, recomputing if a source changed. */
  read(): T {
    if (this._running) {
      throw new Error('Circular reactive dependency detected.');
    }
    track(this);
    this.update();
    if (this._hasError) throw this._error;
    return this._value as T;
  }

  get stale(): boolean {
    return this._state !== CLEAN;
  }

  /** Bring this computation up to date, running it only if a source changed. */
  update(): void {
    if (this.disposed) return;
    if (this._state === CHECK) {
      for (const source of this._sources ?? EMPTY) {
        if (source instanceof Computation) {
          source.update();
          if ((this._state as NodeState) === DIRTY) break;
        }
      }
    }
    if (this._state === DIRTY) {
      this.run();
    } else {
      this._state = CLEAN;
    }
  }

  /** Run unconditionally, tracking the sources read. */
  run(): void {
    if (this.disposed) return;
    const previous = tracking;
    const previousSources = trackingSources;
    const nextSources = new Set<Source>();
    tracking = this as Computation;
    trackingSources = nextSources;
    this._running = true;
    let value: T | undefined;
    let error: unknown;
    let failed = false;
    try {
      value = this._fn();
    } catch (caught) {
      failed = true;
      error = caught;
    } finally {
      this._running = false;
      tracking = previous;
      trackingSources = previousSources;
    }
    this._state = CLEAN;
    this.setSources(nextSources, failed);
    if (this.disposed) return;

    if (failed) {
      const changed = !this._hasError || this._error !== error;
      this._hasError = true;
      this._error = error;
      this._value = undefined;
      if (changed) this.markObserversDirty();
      if (this._schedule) throw error;
      return;
    }

    const changed =
      this._hasError ||
      this._equals === null ||
      !this._equals(this._value as T, value as T);
    this._hasError = false;
    this._error = undefined;
    this._value = value;
    if (changed) this.markObserversDirty();
  }

  /** Replace the function this computation runs; it runs again on next update. */
  setFn(fn: () => T): void {
    this._fn = fn;
    this._mark(DIRTY);
  }

  /** Force a re-run on the next update, as if a source changed. */
  invalidate(): void {
    this._mark(DIRTY);
  }

  private markObserversDirty(): void {
    const observers = this._observers;
    if (!observers) return;
    for (const observer of observers) observer._state = DIRTY;
  }

  /**
   * A failed run keeps its previous subscriptions as well, so a change to
   * anything either run read retries it.
   */
  private setSources(next: Set<Source>, keepPrevious: boolean): void {
    const previous = this._sources;
    if (previous) {
      for (const source of previous) {
        if (keepPrevious) {
          next.add(source);
        } else if (!next.has(source)) {
          source._observers?.delete(this as Computation);
        }
      }
    }
    for (const source of next) {
      (source._observers ??= new Set()).add(this as Computation);
    }
    this._sources = next.size ? next : null;
  }

  _mark(state: NodeState): void {
    if (this._state >= state || this.disposed) return;
    const wasClean = this._state === CLEAN;
    this._state = state;
    if (!wasClean) return;
    if (this._schedule) this._schedule(this as Computation);
    const observers = this._observers;
    if (observers) {
      for (const observer of observers) observer._mark(CHECK);
    }
  }

  protected override onDispose(): void {
    for (const source of this._sources ?? EMPTY) {
      source._observers?.delete(this as Computation);
    }
    this._sources = null;
    this._observers = null;
  }
}

const EMPTY: ReadonlySet<Source> = new Set();
