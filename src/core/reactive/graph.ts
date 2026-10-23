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
  /** Called when the last observer stops reading this source. */
  _unobserved?(): void;
}

function unobserve(source: Source, observer: Computation): void {
  const observers = source._observers;
  if (!observers?.delete(observer) || observers.size > 0) return;
  source._unobserved?.();
}

export type Equals<T> = (a: T, b: T) => boolean;

let tracking: Computation | null = null;
let trackingSources: Set<Source> | null = null;

/**
 * Record a read, subscribing at once when the running computation was not
 * already observing the source. A write to it later in the same run (by the
 * computation itself or by something it calls) then reaches the computation
 * instead of being lost; `setSources` drops the subscriptions not read.
 */
function track(source: Source): void {
  if (!trackingSources) return;
  // One hash lookup on a repeated read: the size tells whether it was new.
  const before = trackingSources.size;
  trackingSources.add(source);
  if (trackingSources.size === before) return;
  const observer = tracking as Computation;
  if (!observer._sources?.has(source)) {
    (source._observers ??= new Set()).add(observer);
  }
}

/** Notify every observer of `source` that its value changed. */
export function notifySource(source: Source, except?: Computation): void {
  const observers = source._observers;
  if (!observers) return;
  for (const observer of observers) {
    if (observer !== except) observer._mark(DIRTY);
  }
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
  /** A run has produced a value; the first value is never compared. */
  _hasValue = false;
  _running = false;
  /** The CHECK walk is inside this computation (cycle guard). */
  _walking = false;
  /** A derive() or selector() computation: writes from inside it are rejected. */
  _derived = false;
  /** Sources read so far by the run in progress. */
  _tracked: Set<Source> | null = null;
  _invalidatedWhileRunning = false;
  /** The scheduler dropped this computation's pending run. */
  _dropped = false;
  readonly _equals: Equals<T> | null;
  readonly _failedRunSources: 'union' | 'previous';
  /** How this computation reacts to going stale; null for lazily read values. */
  _schedule: Scheduler | null;

  constructor(
    owner: Owner | null,
    fn: () => T,
    schedule: Scheduler | null,
    equals: Equals<T> | null = Object.is,
    failedRunSources: 'union' | 'previous' = 'union'
  ) {
    super(owner);
    this._fn = fn;
    this._schedule = schedule;
    this._equals = equals;
    this._failedRunSources = failedRunSources;
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
    if (this._state === CHECK) checkSources(this as Computation);
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
    this._tracked = nextSources;
    this._running = true;
    this._invalidatedWhileRunning = false;
    this._dropped = false;
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
      this._tracked = null;
      tracking = previous;
      trackingSources = previousSources;
    }
    if (this.disposed) {
      // Disposal during the run already released the previous sources;
      // the reads of this run subscribed as they happened.
      for (const source of nextSources) unobserve(source, this as Computation);
      return;
    }
    this._state = this._invalidatedWhileRunning ? DIRTY : CLEAN;
    this.setSources(
      failed && this._failedRunSources === 'previous'
        ? new Set(this._sources ?? EMPTY)
        : nextSources,
      failed && this._failedRunSources === 'union',
      nextSources
    );
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
      !this._hasValue ||
      this._equals === null ||
      !this._equals(this._value as T, value as T);
    this._hasError = false;
    this._hasValue = true;
    this._error = undefined;
    this._value = value;
    if (changed) this.markObserversDirty();
  }

  /** Replace the function this computation runs; it runs again on next update. */
  setFn(fn: () => T): void {
    this._fn = fn;
    this._mark(DIRTY);
  }

  /** Restore subscriptions captured before a discarded component pass. */
  restoreSources(sources: ReadonlySet<Source>): void {
    this.setSources(new Set(sources), false, null);
  }

  /** Force a re-run on the next update, as if a source changed. */
  invalidate(): void {
    this._mark(DIRTY);
  }

  /** Retry after a later source change, without rerunning a discarded pass. */
  deferRetry(): void {
    if (this.disposed) return;
    this._state = DIRTY;
    this._dropped = true;
  }

  private markObserversDirty(): void {
    const observers = this._observers;
    if (!observers) return;
    for (const observer of observers) observer._state = DIRTY;
  }

  /**
   * Make `next` the subscription set. Sources read in the run just finished
   * (`tracked`) are already subscribed, so any of them not kept are released
   * here along with the previous sources not in `next`. A failed run keeps
   * its previous subscriptions as well, so a change to anything either run
   * read retries it.
   */
  private setSources(
    next: Set<Source>,
    keepPrevious: boolean,
    tracked: ReadonlySet<Source> | null
  ): void {
    const previous = this._sources;
    if (previous) {
      for (const source of previous) {
        if (keepPrevious) {
          next.add(source);
        } else if (!next.has(source)) {
          unobserve(source, this as Computation);
        }
      }
    }
    if (tracked) {
      // Everything in `next` is already subscribed: a tracked source was
      // linked when it was read, a kept previous source never left.
      if (tracked !== next) {
        for (const source of tracked) {
          if (!next.has(source)) unobserve(source, this as Computation);
        }
      }
    } else {
      for (const source of next) {
        (source._observers ??= new Set()).add(this as Computation);
      }
    }
    this._sources = next.size ? next : null;
  }

  /**
   * The scheduler dropped this computation's pending run (loop guard or
   * clear). It stays stale, and the next change schedules it again.
   */
  dropScheduled(): void {
    if (!this.disposed && this._state !== CLEAN) this._dropped = true;
  }

  _mark(state: NodeState, from?: Source): void {
    if (this._markSelf(state, from)) propagateCheck(this as Computation);
  }

  /**
   * Record that this computation is stale and schedule it. Returns true when
   * the computations downstream of it must be marked CHECK as well.
   */
  _markSelf(state: NodeState, from?: Source): boolean {
    if (this.disposed) return false;
    // A direct write to a source, or a change behind a derived value this
    // run has already read, means the value read is stale; the run repeats.
    // A derived value not yet read in this run is brought up to date when
    // it is read, so its mark is ignored.
    if (
      this._running &&
      (state === DIRTY || (from !== undefined && this._tracked?.has(from)))
    ) {
      const firstInvalidation = !this._invalidatedWhileRunning;
      this._invalidatedWhileRunning = true;
      if (state > this._state) this._state = state;
      this._dropped = false;
      this._schedule?.(this as Computation);
      return firstInvalidation;
    }
    const dropped = this._dropped;
    if (this._state >= state && !dropped) return false;
    const wasClean = this._state === CLEAN;
    if (state > this._state) this._state = state;
    if (!wasClean && !dropped) return false;
    this._dropped = false;
    if (this._schedule) this._schedule(this as Computation);
    return true;
  }

  protected override onDispose(): void {
    for (const source of this._sources ?? EMPTY) {
      unobserve(source, this as Computation);
    }
    this._sources = null;
    this._observers = null;
  }
}

const EMPTY: ReadonlySet<Source> = new Set();

/**
 * Mark everything downstream of `root` CHECK, depth first and in observer
 * order, with an explicit stack so a long chain does not overflow the call
 * stack.
 */
function propagateCheck(root: Computation): void {
  const first = root._observers;
  if (!first) return;
  const owners: Computation[] = [root];
  const cursors: Iterator<Computation>[] = [first.values()];
  while (owners.length > 0) {
    const top = owners.length - 1;
    const step = cursors[top]!.next();
    if (step.done) {
      owners.pop();
      cursors.pop();
      continue;
    }
    const observer = step.value;
    if (observer._markSelf(CHECK, owners[top])) {
      const observers = observer._observers;
      if (observers) {
        owners.push(observer);
        cursors.push(observers.values());
      }
    }
  }
}

/**
 * Bring the stale sources of `root` up to date, stopping at the first one
 * that changed it. The walk keeps its own stack, so the depth of a chain of
 * derived values is not limited by the call stack.
 */
function checkSources(root: Computation): void {
  const nodes: Computation[] = [root];
  const cursors: Iterator<Source>[] = [(root._sources ?? EMPTY).values()];
  root._walking = true;
  while (nodes.length > 0) {
    const top = nodes.length - 1;
    const node = nodes[top]!;
    let next: Computation | null = null;
    if (node._state === CHECK) {
      for (
        let step = cursors[top]!.next();
        !step.done;
        step = cursors[top]!.next()
      ) {
        const source = step.value;
        if (!(source instanceof Computation) || source.disposed) continue;
        if (source._state === CHECK) {
          // A source already being walked is a cycle; leave it alone.
          if (!source._walking) {
            next = source;
            break;
          }
        } else if (source._state === DIRTY) {
          source.run();
          if ((node._state as NodeState) === DIRTY) break;
        }
      }
    }
    if (next) {
      next._walking = true;
      nodes.push(next);
      cursors.push((next._sources ?? EMPTY).values());
      continue;
    }
    // This node's sources are settled (or one changed it): bring it current,
    // which lets its own observer in the walk see the result.
    nodes.pop();
    cursors.pop();
    node._walking = false;
    if (node !== root) {
      if (node._state === DIRTY) node.run();
      else node._state = CLEAN;
    }
  }
}
