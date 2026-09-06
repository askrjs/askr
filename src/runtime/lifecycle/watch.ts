import { getComponentLifecycleSlot as getLifecycleSlot } from '../component/capabilities';
import { ownCleanup } from '../ownership/record';
import {
  claimHookIndex,
  getCurrentComponentInstance,
} from '../component/scope';
import {
  registerCommitOperation,
  type ComponentInstance,
} from '../component/instance';
import {
  createFineGrainedEffect,
  type FineGrainedEffectHandle,
} from '../reactivity/effect';
import { routeComponentErrorToBoundary } from '../component/error-boundary';
import type { ReadableSource } from '../reactivity/readable';
import { LifecycleSlot } from './policy';
declare const __ASKR_DEVELOPMENT_BUILD__: boolean;

/** A callable reactive source accepted by {@link watch}. */
export type WatchSource<T> = ReadableSource<T>;

/** Values inferred from an ordered tuple of {@link WatchSource} accessors. */
export type WatchValues<TSources extends readonly WatchSource<unknown>[]> = {
  -readonly [TIndex in keyof TSources]: ReturnType<TSources[TIndex]>;
};

/** Post-commit generation details supplied to a {@link watch} callback. */
export interface WatchContext<TValue> {
  readonly initial: boolean;
  readonly previous: TValue | undefined;
  readonly signal: AbortSignal;
}

/** Owned side-effect callback invoked by {@link watch}. */
export type WatchCallback<TValue> = (
  value: TValue,
  context: WatchContext<TValue>
) => void | (() => void) | PromiseLike<void>;

interface WatchSlot<TValue> extends LifecycleSlot {
  kind: 'watch';
  sources: readonly WatchSource<unknown>[];
  pendingSources: readonly WatchSource<unknown>[];
  callback: WatchCallback<TValue>;
  pendingCallback: WatchCallback<TValue>;
  effect: FineGrainedEffectHandle<TValue> | null;
  controller: AbortController | null;
  cleanup: (() => void) | null;
  cleanupRegistered: boolean;
  hasObserved: boolean;
}

function watchValuesEqual(
  previous: readonly unknown[],
  next: readonly unknown[]
): boolean {
  if (previous.length !== next.length) return false;
  for (let index = 0; index < previous.length; index += 1) {
    if (!Object.is(previous[index], next[index])) return false;
  }
  return true;
}

function stopWatchGeneration<TValue>(slot: WatchSlot<TValue>): void {
  const controller = slot.controller;
  slot.controller = null;
  if (controller && !controller.signal.aborted) controller.abort();

  const cleanup = slot.cleanup;
  slot.cleanup = null;
  cleanup?.();
}

function stopWatchSlot<TValue>(slot: WatchSlot<TValue>): void {
  stopWatchGeneration(slot);
  slot.effect?.cleanup();
  slot.effect = null;
}

function reportWatchError(instance: ComponentInstance, error: unknown): void {
  if (!routeComponentErrorToBoundary(instance, error)) throw error;
}

function commitWatchSlot<TValue>(
  instance: ComponentInstance,
  slot: WatchSlot<TValue>
): void {
  slot.callback = slot.pendingCallback;
  slot.sources = slot.pendingSources;

  const compute = () => {
    const values = slot.sources.map((source) => source());
    return (values.length === 1 ? values[0] : values) as TValue;
  };

  const observe = (value: TValue, previous: TValue | undefined) => {
    stopWatchGeneration(slot);
    const controller = new AbortController();
    slot.controller = controller;
    const initial = !slot.hasObserved;
    slot.hasObserved = true;

    let result: ReturnType<WatchCallback<TValue>>;
    try {
      result = slot.callback(value, {
        initial,
        previous,
        signal: controller.signal,
      });
    } catch (error) {
      reportWatchError(instance, error);
      return;
    }

    if (typeof result === 'function') {
      slot.cleanup = result;
      return;
    }

    if (result && typeof result.then === 'function') {
      Promise.resolve(result).catch((error) => {
        if (!controller.signal.aborted) reportWatchError(instance, error);
      });
    }
  };

  if (!slot.effect) {
    slot.effect = createFineGrainedEffect<TValue>({
      lane: 'post',
      compute,
      commit: observe,
      equals: (previous, next) =>
        Array.isArray(previous) && Array.isArray(next)
          ? watchValuesEqual(previous, next)
          : Object.is(previous, next),
      onError: (error) => reportWatchError(instance, error),
    });
  } else {
    slot.effect.updateCompute(compute);
  }

  if (!slot.cleanupRegistered) {
    slot.cleanupRegistered = true;
    ownCleanup(instance.owner, () => {
      stopWatchSlot(slot);
      slot.cleanupRegistered = false;
    });
  }
}

/** Observe one readable source after commit and whenever its value changes. */
export function watch<TValue>(
  source: WatchSource<TValue>,
  callback: WatchCallback<TValue>
): void;

/** Observe an ordered tuple of readable sources after commit and whenever an entry changes. */
export function watch<const TSources extends readonly WatchSource<unknown>[]>(
  sources: TSources,
  callback: WatchCallback<WatchValues<TSources>>
): void;

export function watch<TValue>(
  sourceOrSources: WatchSource<TValue> | readonly WatchSource<unknown>[],
  callback: WatchCallback<TValue>
): void {
  const instance = getCurrentComponentInstance();
  if (!instance) return;

  const index = claimHookIndex(instance, 'watch');
  const sources = (
    Array.isArray(sourceOrSources) ? sourceOrSources : [sourceOrSources]
  ) as readonly WatchSource<unknown>[];
  const slot = getLifecycleSlot<WatchSlot<TValue>>(
    instance,
    index,
    'watch',
    () => ({
      kind: 'watch',
      sources,
      pendingSources: sources,
      callback,
      pendingCallback: callback,
      effect: null,
      controller: null,
      cleanup: null,
      cleanupRegistered: false,
      hasObserved: false,
    })
  );

  slot.pendingSources = sources;
  slot.pendingCallback = callback;
  if (instance.ssr) return;

  registerCommitOperation(() => commitWatchSlot(instance, slot));
}
export {
  WatchSlot,
  watchValuesEqual,
  stopWatchGeneration,
  stopWatchSlot,
  reportWatchError,
  commitWatchSlot,
};
