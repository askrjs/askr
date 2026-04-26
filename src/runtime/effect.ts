import {
  getCurrentInstance,
  setCurrentComponentInstance,
  type ComponentInstance,
} from './component';
import { type ReadableSource } from './readable';
import { globalScheduler, type SchedulerLane } from './scheduler';

type EffectRegistry = WeakMap<
  ReadableSource<unknown>,
  Set<FineGrainedEffect<unknown>>
>;

type EffectFlushSets = Record<SchedulerLane, Set<FineGrainedEffect<unknown>>>;

type EffectPendingFlushState = Record<SchedulerLane, boolean>;

const effectSources: EffectRegistry = new WeakMap();
const dirtyEffectsByLane: EffectFlushSets = {
  derived: new Set(),
  component: new Set(),
  reactive: new Set(),
  post: new Set(),
};
const hasPendingLaneFlush: EffectPendingFlushState = {
  derived: false,
  component: false,
  reactive: false,
  post: false,
};

let effectTrackingToken = 0;

const _EMPTY_PENDING_SOURCES = new Set<ReadableSource<unknown>>();
const _evalSourceBuffer = new Set<ReadableSource<unknown>>();

const effectTrackingInstance = {
  _pendingReadSources: _EMPTY_PENDING_SOURCES as Set<ReadableSource<unknown>>,
  _currentRenderToken: 0,
} as Partial<ComponentInstance> as ComponentInstance;

export interface FineGrainedEffect<T> {
  lane: SchedulerLane;
  compute: () => T;
  commit: (value: T, previousValue: T | undefined) => void;
  equals: (previousValue: T, nextValue: T) => boolean;
  readSources: Set<ReadableSource<unknown>>;
  isActive: boolean;
  hasValue: boolean;
  lastValue: T | undefined;
  onError?: (error: unknown) => void;
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
  let effects = effectSources.get(source);
  if (!effects) {
    effects = new Set();
    effectSources.set(source, effects);
  }
  effects.add(effect);
}

function unregisterEffectSource(
  source: ReadableSource<unknown>,
  effect: FineGrainedEffect<unknown>
): void {
  effectSources.get(source)?.delete(effect);
}

function clearEffectSubscriptions(effect: FineGrainedEffect<unknown>): void {
  for (const source of effect.readSources) {
    unregisterEffectSource(source, effect);
  }
  effect.readSources.clear();
}

function normalizeNextSources(
  previousSources: Set<ReadableSource<unknown>>,
  pendingSources: Set<ReadableSource<unknown>>
): Set<ReadableSource<unknown>> {
  if (previousSources.size === pendingSources.size) {
    let same = true;
    for (const source of previousSources) {
      if (!pendingSources.has(source)) {
        same = false;
        break;
      }
    }

    if (same) {
      return previousSources;
    }
  }

  return new Set(pendingSources);
}

function evaluateEffect<T>(effect: FineGrainedEffect<T>): {
  value: T;
  nextSources: Set<ReadableSource<unknown>>;
} {
  const previousInstance = getCurrentInstance();

  _evalSourceBuffer.clear();
  effectTrackingToken += 1;
  effectTrackingInstance._pendingReadSources = _evalSourceBuffer;
  effectTrackingInstance._currentRenderToken = effectTrackingToken;

  setCurrentComponentInstance(effectTrackingInstance);

  try {
    const value = effect.compute();
    const nextSources = normalizeNextSources(
      effect.readSources,
      _evalSourceBuffer
    );
    return { value, nextSources };
  } finally {
    effectTrackingInstance._pendingReadSources = _EMPTY_PENDING_SOURCES as Set<
      ReadableSource<unknown>
    >;
    effectTrackingInstance._currentRenderToken = 0;
    setCurrentComponentInstance(previousInstance);
  }
}

function commitEffectSubscriptions(
  effect: FineGrainedEffect<unknown>,
  nextSources: Set<ReadableSource<unknown>>
): void {
  const previousSources = effect.readSources;

  if (previousSources === nextSources) {
    return;
  }

  for (const source of previousSources) {
    if (!nextSources.has(source)) {
      unregisterEffectSource(source, effect);
    }
  }

  for (const source of nextSources) {
    if (!previousSources.has(source)) {
      registerEffectSource(source, effect);
    }
  }

  effect.readSources = nextSources;
}

function commitEffectResult<T>(
  effect: FineGrainedEffect<T>,
  value: T,
  nextSources: Set<ReadableSource<unknown>>
): void {
  const previousValue = effect.lastValue;
  const shouldCommit =
    !effect.hasValue || !effect.equals(previousValue as T, value);

  if (shouldCommit) {
    effect.commit(value, effect.hasValue ? previousValue : undefined);
  }

  commitEffectSubscriptions(effect, nextSources);
  effect.lastValue = value;
  effect.hasValue = true;
}

function flushLaneEffects(lane: SchedulerLane): void {
  hasPendingLaneFlush[lane] = false;

  const effects = dirtyEffectsByLane[lane];
  if (effects.size === 0) {
    return;
  }

  const pending = Array.from(effects);
  effects.clear();

  for (const effect of pending) {
    if (!effect.isActive) {
      continue;
    }

    try {
      const { value, nextSources } = evaluateEffect(effect);
      commitEffectResult(effect, value, nextSources);
    } catch (error) {
      effect.onError?.(error);
    }
  }
}

function scheduleLaneFlush(lane: SchedulerLane): void {
  if (hasPendingLaneFlush[lane]) {
    return;
  }

  hasPendingLaneFlush[lane] = true;
  globalScheduler.enqueueInLane(lane, () => {
    flushLaneEffects(lane);
  });
}

function unscheduleEffect(effect: FineGrainedEffect<unknown>): void {
  dirtyEffectsByLane[effect.lane].delete(effect);
}

function recomputeEffectNow<T>(effect: FineGrainedEffect<T>): void {
  const { value, nextSources } = evaluateEffect(effect);
  commitEffectResult(effect, value, nextSources);
}

export function markFineGrainedEffectsDirtySource(
  source: ReadableSource<unknown>
): void {
  const effects = effectSources.get(source);
  if (!effects || effects.size === 0) {
    return;
  }

  for (const effect of effects) {
    if (!effect.isActive) {
      continue;
    }
    dirtyEffectsByLane[effect.lane].add(effect);
  }

  for (const lane of Object.keys(hasPendingLaneFlush) as SchedulerLane[]) {
    if (dirtyEffectsByLane[lane].size > 0) {
      scheduleLaneFlush(lane);
    }
  }
}

export function createFineGrainedEffect<T>(
  options: CreateFineGrainedEffectOptions<T>
): FineGrainedEffectHandle<T> {
  const effect: FineGrainedEffect<T> = {
    lane: options.lane,
    compute: options.compute,
    commit: options.commit,
    equals: options.equals ?? Object.is,
    readSources: new Set(),
    isActive: true,
    hasValue: false,
    lastValue: undefined,
    onError: options.onError,
  };

  recomputeEffectNow(effect);

  return {
    cleanup(): void {
      if (!effect.isActive) {
        return;
      }

      effect.isActive = false;
      unscheduleEffect(effect);
      clearEffectSubscriptions(effect);
    },

    updateCompute(nextCompute: () => T): void {
      if (!effect.isActive) {
        return;
      }

      effect.compute = nextCompute;
      unscheduleEffect(effect);
      recomputeEffectNow(effect);
    },

    flush(): void {
      if (!effect.isActive) {
        return;
      }

      unscheduleEffect(effect);
      recomputeEffectNow(effect);
    },
  };
}
