import { incDevCounter } from '../diagnostics/dev-namespace';
import {
  type FineGrainedReadCollector,
  type ReadableSource,
  withFineGrainedReadTracking,
} from './readable';
import { requestRuntimeWork, SCHEDULER_LANES } from '../access';
import { ScheduledWork } from '../scheduled-work';
import type { SchedulerLane } from '../scheduler';

declare const __ASKR_DEVELOPMENT_BUILD__: boolean;

const DEVELOPMENT_BUILD_ENABLED = __ASKR_DEVELOPMENT_BUILD__;

type RegisteredEffects =
  | FineGrainedEffect<unknown>
  | Set<FineGrainedEffect<unknown>>;

type EffectRegistry = WeakMap<ReadableSource<unknown>, RegisteredEffects>;

const SOURCE_EFFECTS = Symbol('askr.source-effects');
type EffectSource = ReadableSource<unknown> & {
  [SOURCE_EFFECTS]?: RegisteredEffects;
};

type EffectFlushSets = Record<SchedulerLane, Set<FineGrainedEffect<unknown>>>;

const effectSources: EffectRegistry = new WeakMap();
const dirtyEffectsByLane: EffectFlushSets = {
  derived: new Set(),
  component: new Set(),
  reactive: new Set(),
  post: new Set(),
};

const MAX_EFFECT_RUNS_PER_FLUSH = 50;
const LANE_FLUSH_TASKS: Record<SchedulerLane, ScheduledWork> = {
  derived: new ScheduledWork(() => flushLaneEffects('derived')),
  component: new ScheduledWork(() => flushLaneEffects('component')),
  reactive: new ScheduledWork(() => flushLaneEffects('reactive')),
  post: new ScheduledWork(() => flushLaneEffects('post')),
};

type EffectReadSources =
  | ReadableSource<unknown>
  | ReadableSource<unknown>[]
  | Set<ReadableSource<unknown>>
  | null;

type EffectReadSourceCollection =
  | ReadableSource<unknown>[]
  | Set<ReadableSource<unknown>>;

function isEffectReadSourceCollection(
  sources: EffectReadSources
): sources is EffectReadSourceCollection {
  return Array.isArray(sources) || sources instanceof Set;
}

function effectReadSourceCollectionHas(
  sources: EffectReadSourceCollection,
  source: ReadableSource<unknown>
): boolean {
  return Array.isArray(sources)
    ? sources.includes(source)
    : sources.has(source);
}

function getRegisteredEffects(
  source: ReadableSource<unknown>
): RegisteredEffects | undefined {
  return (source as EffectSource)[SOURCE_EFFECTS] ?? effectSources.get(source);
}

function setRegisteredEffects(
  source: ReadableSource<unknown>,
  registered: RegisteredEffects
): void {
  const effectSource = source as EffectSource;
  try {
    effectSource[SOURCE_EFFECTS] = registered;
    if (effectSource[SOURCE_EFFECTS] === registered) {
      return;
    }
  } catch {
    // Frozen external readables retain the WeakMap fallback.
  }
  effectSources.set(source, registered);
}

function deleteRegisteredEffects(source: ReadableSource<unknown>): void {
  const effectSource = source as EffectSource;
  if (effectSource[SOURCE_EFFECTS] !== undefined) {
    try {
      delete effectSource[SOURCE_EFFECTS];
      return;
    } catch {
      // Frozen external readables never receive the symbol fast path.
    }
  }
  effectSources.delete(source);
}

export interface FineGrainedEffect<T> extends FineGrainedReadCollector {
  lane: SchedulerLane;
  compute(): T;
  commit(value: T, previousValue: T | undefined): void;
  equals(previousValue: T, nextValue: T): boolean;
  readSources: EffectReadSources;
  readSource2: ReadableSource<unknown> | null;
  isActive: boolean;
  hasValue: boolean;
  lastValue: T | undefined;
  onError?(error: unknown): void;
}

export interface FineGrainedEffectHandle<T> {
  cleanup(): void;
  updateCompute(nextCompute: () => T): void;
  flush(): void;
}

export interface CreateFineGrainedEffectOptions<T> {
  lane: SchedulerLane;
  compute: () => T;
  commit: (value: T, previousValue: T | undefined) => void;
  equals?: (previousValue: T, nextValue: T) => boolean;
  onError?: (error: unknown) => void;
}

function registerEffectSource(
  source: ReadableSource<unknown>,
  effect: FineGrainedEffect<unknown>
): void {
  const registered = getRegisteredEffects(source);
  if (!registered) {
    setRegisteredEffects(source, effect);
    return;
  }
  if (registered instanceof Set) {
    registered.add(effect);
    return;
  }
  if (registered === effect) {
    return;
  }
  setRegisteredEffects(source, new Set([registered, effect]));
}

function unregisterEffectSource(
  source: ReadableSource<unknown>,
  effect: FineGrainedEffect<unknown>
): void {
  const registered = getRegisteredEffects(source);
  if (!registered) {
    return;
  }
  if (!(registered instanceof Set)) {
    if (registered === effect) {
      deleteRegisteredEffects(source);
    }
    return;
  }

  registered.delete(effect);
  if (registered.size === 0) {
    deleteRegisteredEffects(source);
  } else if (registered.size === 1) {
    setRegisteredEffects(source, registered.values().next().value!);
  }
}

function clearEffectSubscriptions(effect: FineGrainedEffect<unknown>): void {
  const sources = effect.readSources;
  if (isEffectReadSourceCollection(sources)) {
    for (const source of sources) {
      unregisterEffectSource(source, effect);
    }
    if (sources instanceof Set) {
      sources.clear();
    } else {
      sources.length = 0;
    }
  } else if (sources) {
    unregisterEffectSource(sources, effect);
  }
  if (effect.readSource2) {
    unregisterEffectSource(effect.readSource2, effect);
  }
  effect.readSources = null;
  effect.readSource2 = null;
}

function evaluateAndCommitEffect<T>(effect: FineGrainedEffect<T>): void {
  effect._pendingFineGrainedReadSource = null;
  effect._pendingFineGrainedReadSources = null;

  if (DEVELOPMENT_BUILD_ENABLED) {
    incDevCounter('effectRuns');
  }
  try {
    let value: T;
    try {
      value = withFineGrainedReadTracking(effect, effect.compute);
    } catch (error) {
      // A handled first-run failure needs the sources it reached so a later
      // write can recover it. Once an effect has committed, keep its last
      // complete dependency set on compute failure rather than publishing a
      // partial dynamic branch.
      if (!effect.hasValue) {
        const [nextSources, nextSource2] = getPendingEffectSources(effect);
        commitEffectSubscriptions(effect, nextSources, nextSource2);
      }
      throw error;
    }

    const [nextSources, nextSource2] = getPendingEffectSources(effect);
    commitEffectResult(effect, value, nextSources, nextSource2);
  } finally {
    effect._pendingFineGrainedReadSource = null;
    effect._pendingFineGrainedReadSources = null;
  }
}

function getPendingEffectSources(
  effect: FineGrainedEffect<unknown>
): [EffectReadSources, ReadableSource<unknown> | null] {
  const pendingAdditionalSources = effect._pendingFineGrainedReadSources;
  const hasPendingCollection = isEffectReadSourceCollection(
    pendingAdditionalSources
  );
  const nextSources = hasPendingCollection
    ? pendingAdditionalSources
    : effect._pendingFineGrainedReadSource;
  const nextSource2 =
    pendingAdditionalSources && !hasPendingCollection
      ? pendingAdditionalSources
      : null;

  return [nextSources, nextSource2];
}

function commitEffectSubscriptions(
  effect: FineGrainedEffect<unknown>,
  nextSources: EffectReadSources,
  nextSource2: ReadableSource<unknown> | null
): void {
  const previousSources = effect.readSources;
  const previousSource2 = effect.readSource2;

  if (previousSources === nextSources && previousSource2 === nextSource2) {
    return;
  }

  const previousCollection = isEffectReadSourceCollection(previousSources);
  const nextCollection = isEffectReadSourceCollection(nextSources);
  if (!previousCollection && !nextCollection) {
    if (
      previousSources &&
      previousSources !== nextSources &&
      previousSources !== nextSource2
    ) {
      unregisterEffectSource(previousSources, effect);
    }
    if (
      previousSource2 &&
      previousSource2 !== nextSources &&
      previousSource2 !== nextSource2
    ) {
      unregisterEffectSource(previousSource2, effect);
    }
    if (
      nextSources &&
      nextSources !== previousSources &&
      nextSources !== previousSource2
    ) {
      registerEffectSource(nextSources, effect);
    }
    if (
      nextSource2 &&
      nextSource2 !== previousSources &&
      nextSource2 !== previousSource2
    ) {
      registerEffectSource(nextSource2, effect);
    }
    effect.readSources = nextSources;
    effect.readSource2 = nextSource2;
    return;
  }

  const stateHas = (
    sources: EffectReadSources,
    source2: ReadableSource<unknown> | null,
    source: ReadableSource<unknown>
  ): boolean =>
    isEffectReadSourceCollection(sources)
      ? effectReadSourceCollectionHas(sources, source)
      : sources === source || source2 === source;

  const previousSize = previousCollection
    ? Array.isArray(previousSources)
      ? previousSources.length
      : previousSources.size
    : (previousSources ? 1 : 0) + (previousSource2 ? 1 : 0);
  const nextSize = nextCollection
    ? Array.isArray(nextSources)
      ? nextSources.length
      : nextSources.size
    : (nextSources ? 1 : 0) + (nextSource2 ? 1 : 0);
  if (previousSize === nextSize) {
    let same = true;
    if (previousCollection) {
      for (const source of previousSources) {
        if (!stateHas(nextSources, nextSource2, source)) {
          same = false;
          break;
        }
      }
    } else {
      same =
        (!previousSources ||
          stateHas(nextSources, nextSource2, previousSources)) &&
        (!previousSource2 ||
          stateHas(nextSources, nextSource2, previousSource2));
    }
    if (same) {
      return;
    }
  }

  if (previousCollection) {
    for (const source of previousSources) {
      if (!stateHas(nextSources, nextSource2, source)) {
        unregisterEffectSource(source, effect);
      }
    }
  } else {
    if (
      previousSources &&
      !stateHas(nextSources, nextSource2, previousSources)
    ) {
      unregisterEffectSource(previousSources, effect);
    }
    if (
      previousSource2 &&
      !stateHas(nextSources, nextSource2, previousSource2)
    ) {
      unregisterEffectSource(previousSource2, effect);
    }
  }

  if (nextCollection) {
    for (const source of nextSources) {
      if (!stateHas(previousSources, previousSource2, source)) {
        registerEffectSource(source, effect);
      }
    }
  } else {
    if (
      nextSources &&
      !stateHas(previousSources, previousSource2, nextSources)
    ) {
      registerEffectSource(nextSources, effect);
    }
    if (
      nextSource2 &&
      !stateHas(previousSources, previousSource2, nextSource2)
    ) {
      registerEffectSource(nextSource2, effect);
    }
  }

  effect.readSources = nextSources;
  effect.readSource2 = nextSource2;
}

function commitEffectResult<T>(
  effect: FineGrainedEffect<T>,
  value: T,
  nextSources: EffectReadSources,
  nextSource2: ReadableSource<unknown> | null
): void {
  const previousValue = effect.lastValue;
  const shouldCommit =
    !effect.hasValue || !effect.equals(previousValue as T, value);

  // Dependencies describe the successful compute, not the DOM/user commit.
  // Publish them first so a throwing commit cannot leave the effect inert or
  // subscribed to the previous branch forever.
  commitEffectSubscriptions(effect, nextSources, nextSource2);

  if (shouldCommit) {
    effect.commit(value, effect.hasValue ? previousValue : undefined);
  }

  effect.lastValue = value;
  effect.hasValue = true;
}

function handleEffectError(
  effect: FineGrainedEffect<unknown>,
  error: unknown
): void {
  if (effect.onError) {
    effect.onError(error);
    return;
  }
  throw error;
}

function flushLaneEffects(lane: SchedulerLane): void {
  const effects = dirtyEffectsByLane[lane];
  if (effects.size === 0) {
    return;
  }

  const pending = effects.values();
  const effectRuns = new Map<FineGrainedEffect<unknown>, number>();
  let failures: unknown[] | null = null;
  let next = pending.next();

  while (!next.done) {
    const effect = next.value as FineGrainedEffect<unknown>;
    effects.delete(effect);
    if (!effect.isActive) {
      next = pending.next();
      continue;
    }

    const runCount = (effectRuns.get(effect) ?? 0) + 1;
    effectRuns.set(effect, runCount);
    if (runCount > MAX_EFFECT_RUNS_PER_FLUSH) {
      const error = new Error(
        `[Askr] fine-grained effect exceeded ${MAX_EFFECT_RUNS_PER_FLUSH} runs in one flush. Likely reactive cycle.`
      );
      try {
        handleEffectError(effect, error);
      } catch (unhandledError) {
        (failures ??= []).push(unhandledError);
      }
      next = pending.next();
      continue;
    }

    try {
      evaluateAndCommitEffect(effect);
    } catch (error) {
      try {
        handleEffectError(effect, error);
      } catch (unhandledError) {
        (failures ??= []).push(unhandledError);
      }
    }

    next = pending.next();
  }

  if (failures?.length === 1) {
    throw failures[0];
  }
  if (failures && failures.length > 1) {
    throw new AggregateError(failures, 'Fine-grained effect failures');
  }
}

function unscheduleEffect(effect: FineGrainedEffect<unknown>): void {
  dirtyEffectsByLane[effect.lane].delete(effect);
}

function recomputeEffectNow<T>(effect: FineGrainedEffect<T>): void {
  try {
    evaluateAndCommitEffect(effect);
  } catch (error) {
    handleEffectError(effect, error);
  }
}

export function markFineGrainedEffectsDirtySource(
  source: ReadableSource<unknown>
): void {
  const registered = getRegisteredEffects(source);
  if (!registered) {
    return;
  }

  if (registered instanceof Set) {
    for (const effect of registered) {
      markDirtyEffect(effect);
    }
  } else {
    markDirtyEffect(registered);
  }

  for (const lane of SCHEDULER_LANES) {
    if (dirtyEffectsByLane[lane].size)
      requestRuntimeWork(lane, LANE_FLUSH_TASKS[lane]);
  }
}

function markDirtyEffect(effect: FineGrainedEffect<unknown>): void {
  if (!effect.isActive) return;
  dirtyEffectsByLane[effect.lane].add(effect);
}

class FineGrainedEffectImpl<T>
  implements FineGrainedEffect<T>, FineGrainedEffectHandle<T>
{
  lane: SchedulerLane;
  compute: () => T;
  commit: (value: T, previousValue: T | undefined) => void;
  equals: (previousValue: T, nextValue: T) => boolean;
  readSources: EffectReadSources = null;
  readSource2: ReadableSource<unknown> | null = null;
  _pendingFineGrainedReadSource: ReadableSource<unknown> | null = null;
  _pendingFineGrainedReadSources:
    | ReadableSource<unknown>
    | ReadableSource<unknown>[]
    | Set<ReadableSource<unknown>>
    | null = null;
  isActive = true;
  hasValue = false;
  lastValue: T | undefined = undefined;
  onError?: (error: unknown) => void;
  /** @internal Receiver state for allocation-sensitive shared callbacks. */
  _owner: unknown;

  constructor(
    lane: SchedulerLane,
    compute: () => T,
    commit: (value: T, previousValue: T | undefined) => void,
    equals: (previousValue: T, nextValue: T) => boolean,
    onError: ((error: unknown) => void) | undefined,
    owner: unknown
  ) {
    this._owner = owner;
    this.lane = lane;
    this.compute = compute;
    this.commit = commit;
    this.equals = equals;
    this.onError = onError;
  }

  cleanup(): void {
    if (!this.isActive) {
      return;
    }

    this.isActive = false;
    unscheduleEffect(this);
    clearEffectSubscriptions(this);
  }

  updateCompute(nextCompute: () => T): void {
    if (!this.isActive) {
      return;
    }

    const previousCompute = this.compute;
    const previousReadSources = this.readSources;
    const previousReadSource2 = this.readSource2;
    const previousHasValue = this.hasValue;
    const previousLastValue = this.lastValue;
    this.compute = nextCompute;
    unscheduleEffect(this);
    try {
      recomputeEffectNow(this);
    } catch (error) {
      // A handled failure accepts the replacement compute and returns above.
      // When the error propagates, keep the existing effect coherent for its
      // caller's rollback/recovery path instead of pairing the replacement
      // compute with the last committed dependency set.
      this.compute = previousCompute;
      unscheduleEffect(this);
      commitEffectSubscriptions(this, previousReadSources, previousReadSource2);
      this.hasValue = previousHasValue;
      this.lastValue = previousLastValue;
      throw error;
    }
  }

  flush(): void {
    if (!this.isActive) {
      return;
    }

    // An unhandled direct failure propagates while the existing effect keeps
    // its last complete subscriptions, allowing a later source write to retry.
    unscheduleEffect(this);
    recomputeEffectNow(this);
  }
}

export function createFineGrainedEffect<T>(
  options: CreateFineGrainedEffectOptions<T>
): FineGrainedEffectHandle<T> {
  const effect = new FineGrainedEffectImpl(
    options.lane,
    options.compute,
    options.commit,
    options.equals ?? Object.is,
    options.onError,
    (
      options as CreateFineGrainedEffectOptions<T> & {
        _owner?: unknown;
      }
    )._owner
  );

  try {
    recomputeEffectNow(effect);
  } catch (error) {
    // Construction returned no handle that could later retire the effect.
    effect.cleanup();
    throw error;
  }

  return effect;
}

/** @internal Allocation-sensitive variant for shared renderer callbacks. */
export function createOwnedFineGrainedEffect<T>(
  lane: SchedulerLane,
  compute: () => T,
  commit: (value: T, previousValue: T | undefined) => void,
  equals: (previousValue: T, nextValue: T) => boolean,
  onError: ((error: unknown) => void) | undefined,
  owner: unknown
): FineGrainedEffectHandle<T> {
  const effect = new FineGrainedEffectImpl(
    lane,
    compute,
    commit,
    equals,
    onError,
    owner
  );

  try {
    recomputeEffectNow(effect);
  } catch (error) {
    // Construction returned no handle that could later retire the effect.
    effect.cleanup();
    throw error;
  }

  return effect;
}
