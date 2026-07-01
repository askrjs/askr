import { incDevCounter } from './dev-namespace';
import { type ReadableSource, withFineGrainedReadTracking } from './readable';
import { enqueueRuntimeLane } from './access';
import type { SchedulerLane } from './scheduler';

type EffectRegistry = WeakMap<
  ReadableSource<unknown>,
  Set<FineGrainedEffect<unknown>>
>;

type EffectFlushSets = Record<SchedulerLane, Set<FineGrainedEffect<unknown>>>;

type EffectPendingFlushState = Record<SchedulerLane, boolean>;
type EffectLaneDirtyState = Record<SchedulerLane, boolean>;

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

const dirtyLaneState: EffectLaneDirtyState = {
  derived: false,
  component: false,
  reactive: false,
  post: false,
};

const MAX_EFFECT_RUNS_PER_FLUSH = 50;
const LANE_FLUSH_TASKS: Record<SchedulerLane, () => void> = {
  derived: () => flushLaneEffects('derived'),
  component: () => flushLaneEffects('component'),
  reactive: () => flushLaneEffects('reactive'),
  post: () => flushLaneEffects('post'),
};

export interface FineGrainedEffect<T> {
  lane: SchedulerLane;
  compute(): T;
  commit(value: T, previousValue: T | undefined): void;
  equals(previousValue: T, nextValue: T): boolean;
  readSources: Set<ReadableSource<unknown>>;
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
  const pendingSources = new Set<ReadableSource<unknown>>();

  incDevCounter('effectRuns');
  const value = withFineGrainedReadTracking(pendingSources, () =>
    effect.compute()
  );
  const nextSources = normalizeNextSources(effect.readSources, pendingSources);
  return { value, nextSources };
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

  const pending = effects.values();
  const effectRuns = new Map<FineGrainedEffect<unknown>, number>();
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
      if (effect.onError) {
        effect.onError(error);
      } else {
        throw error;
      }
      next = pending.next();
      continue;
    }

    try {
      const { value, nextSources } = evaluateEffect(effect);
      commitEffectResult(effect, value, nextSources);
    } catch (error) {
      effect.onError?.(error);
    }

    next = pending.next();
  }
}

function scheduleLaneFlush(lane: SchedulerLane): void {
  if (hasPendingLaneFlush[lane]) {
    return;
  }

  hasPendingLaneFlush[lane] = true;
  enqueueRuntimeLane(lane, LANE_FLUSH_TASKS[lane]);
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

  dirtyLaneState.derived = false;
  dirtyLaneState.component = false;
  dirtyLaneState.reactive = false;
  dirtyLaneState.post = false;

  for (const effect of effects) {
    if (!effect.isActive) {
      continue;
    }
    const lane = effect.lane;
    dirtyEffectsByLane[lane].add(effect);
    dirtyLaneState[lane] = true;
  }

  if (dirtyLaneState.derived) {
    scheduleLaneFlush('derived');
  }
  if (dirtyLaneState.component) {
    scheduleLaneFlush('component');
  }
  if (dirtyLaneState.reactive) {
    scheduleLaneFlush('reactive');
  }
  if (dirtyLaneState.post) {
    scheduleLaneFlush('post');
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
