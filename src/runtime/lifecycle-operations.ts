import { ownCleanup } from './ownership';
import {
  claimHookIndex,
  getCurrentComponentInstance,
  registerCommitOperation,
  type ComponentInstance,
} from './component';
import { isRouteActivityActive } from '../common/route-activity';
import { adjustOwnershipDiagnostic } from './ownership-diagnostics';
import {
  createFineGrainedEffect,
  type FineGrainedEffectHandle,
} from './effect';
import { routeComponentErrorToBoundary } from './error-boundary';
import type { ReadableSource } from './readable';

declare const __ASKR_DEVELOPMENT_BUILD__: boolean;

/** A gating condition for lifecycle primitives like {@link timer}; `true` means active. */
export type ActivityPredicate = () => boolean;

/** Options for {@link timer}. */
export interface TimerOptions {
  when?: ActivityPredicate | readonly ActivityPredicate[];
}

function normalizePredicates(
  predicates: TimerOptions['when']
): readonly ActivityPredicate[] {
  if (!predicates) {
    return [];
  }

  return typeof predicates === 'function' ? [predicates] : predicates;
}

function allPredicatesPass(predicates: readonly ActivityPredicate[]): boolean {
  for (const predicate of predicates) {
    if (!predicate()) {
      return false;
    }
  }

  return true;
}

type LifecycleSlotKind = 'timer' | 'listener' | 'task' | 'watch';

type LifecycleSlot = {
  kind: LifecycleSlotKind;
};

function getLifecycleSlot<TSlot extends LifecycleSlot>(
  instance: ComponentInstance,
  index: number,
  kind: TSlot['kind'],
  create: () => TSlot
): TSlot {
  const lifecycleSlots = (instance.lifecycleSlots ??= []);
  const existing = lifecycleSlots[index];

  if (existing) {
    const slot = existing as LifecycleSlot;
    if (slot.kind !== kind) {
      throw new Error(
        `${kind}() lifecycle order violation: slot ${index} already belongs to ${slot.kind}(). ` +
          'Keep lifecycle primitives in a stable top-level order.'
      );
    }

    return existing as TSlot;
  }

  const slot = create();
  lifecycleSlots[index] = slot;
  return slot;
}

/** {@link ActivityPredicate} that is true while the current route matches `pathOrPaths`. */
export function routeActive(
  pathOrPaths: string | readonly string[]
): ActivityPredicate {
  return () => isRouteActivityActive(pathOrPaths);
}

/** {@link ActivityPredicate} that is true while the document is visible. */
export function documentVisible(): ActivityPredicate {
  return () =>
    typeof document === 'undefined' || document.visibilityState !== 'hidden';
}

/** {@link ActivityPredicate} that is true while the window has focus. */
export function windowFocused(): ActivityPredicate {
  return () =>
    typeof document === 'undefined' ||
    typeof document.hasFocus !== 'function' ||
    document.hasFocus();
}

/** An event target, or a function resolving one, accepted by {@link on}. */
export type ListenerTarget =
  | EventTarget
  | (() => EventTarget | null | undefined);

type ListenerOptions = boolean | AddEventListenerOptions | undefined;

type NormalizedListenerOptions =
  | boolean
  | {
      capture?: boolean;
      once?: boolean;
      passive?: boolean;
      signal?: AbortSignal;
    }
  | undefined;

interface ListenerSlot extends LifecycleSlot {
  kind: 'listener';
  target: EventTarget | null;
  event: string;
  handler: EventListener;
  listener: EventListener;
  options: NormalizedListenerOptions;
  pendingTarget: ListenerTarget;
  pendingEvent: string;
  pendingHandler: EventListener;
  pendingOptions: NormalizedListenerOptions;
  attached: boolean;
  cleanupRegistered: boolean;
}

function normalizeListenerOptions(
  options: ListenerOptions
): NormalizedListenerOptions {
  if (options === undefined || typeof options === 'boolean') {
    return options;
  }

  return {
    ...(options.capture !== undefined ? { capture: options.capture } : {}),
    ...(options.once !== undefined ? { once: options.once } : {}),
    ...(options.passive !== undefined ? { passive: options.passive } : {}),
    ...(options.signal !== undefined ? { signal: options.signal } : {}),
  };
}

function listenerOptionsEqual(
  a: NormalizedListenerOptions,
  b: NormalizedListenerOptions
): boolean {
  if (a === b) {
    return true;
  }
  if (typeof a === 'boolean' || typeof b === 'boolean') {
    return a === b;
  }
  if (!a || !b) {
    return a === b;
  }

  return (
    a.capture === b.capture &&
    a.once === b.once &&
    a.passive === b.passive &&
    a.signal === b.signal
  );
}

function detachListenerSlot(slot: ListenerSlot): void {
  if (!slot.attached || !slot.target) {
    return;
  }

  slot.target.removeEventListener(slot.event, slot.listener, slot.options);
  slot.attached = false;
}

function commitListenerSlot(
  instance: ComponentInstance,
  slot: ListenerSlot
): void {
  slot.handler = slot.pendingHandler;
  const resolvedTarget =
    typeof slot.pendingTarget === 'function'
      ? typeof window === 'undefined'
        ? null
        : (slot.pendingTarget() ?? null)
      : slot.pendingTarget;

  const shouldReattach =
    !slot.attached ||
    slot.target !== resolvedTarget ||
    slot.event !== slot.pendingEvent ||
    !listenerOptionsEqual(slot.options, slot.pendingOptions);

  if (shouldReattach) {
    detachListenerSlot(slot);
    slot.target = resolvedTarget;
    slot.event = slot.pendingEvent;
    slot.options = slot.pendingOptions;
    if (slot.target) {
      slot.target.addEventListener(slot.event, slot.listener, slot.options);
      slot.attached = true;
    }
  }

  if (!slot.cleanupRegistered) {
    slot.cleanupRegistered = true;
    ownCleanup(instance.ownership, () => {
      detachListenerSlot(slot);
      slot.cleanupRegistered = false;
    });
  }
}

/** Attach an owned event listener to `target` for the current component's lifetime. */
export function on(
  target: ListenerTarget,
  event: string,
  handler: EventListener,
  options?: ListenerOptions
): void {
  const instance = getCurrentComponentInstance();
  if (!instance) {
    return;
  }

  const index = claimHookIndex(instance, 'on');
  const normalizedOptions = normalizeListenerOptions(options);
  const slot = getLifecycleSlot<ListenerSlot>(
    instance,
    index,
    'listener',
    () => {
      const createdSlot = {
        kind: 'listener' as const,
        target: null,
        event,
        handler,
        listener: ((evt: Event) => {
          createdSlot.handler.call(createdSlot.target, evt);
        }) as EventListener,
        options: undefined,
        pendingTarget: target,
        pendingEvent: event,
        pendingHandler: handler,
        pendingOptions: normalizedOptions,
        attached: false,
        cleanupRegistered: false,
      };
      return createdSlot;
    }
  );

  slot.pendingTarget = target;
  slot.pendingEvent = event;
  slot.pendingHandler = handler;
  slot.pendingOptions = normalizedOptions;

  registerCommitOperation(() => {
    commitListenerSlot(instance, slot);
  });
}

interface TimerSlot extends LifecycleSlot {
  kind: 'timer';
  id: ReturnType<typeof setInterval> | null;
  intervalMs: number | null;
  pendingIntervalMs: number;
  callback: () => void;
  predicates: readonly ActivityPredicate[];
  pendingCallback: () => void;
  pendingPredicates: readonly ActivityPredicate[];
  cleanupRegistered: boolean;
}

function stopTimerSlot(slot: TimerSlot): void {
  if (slot.id === null) {
    return;
  }

  clearInterval(slot.id);
  slot.id = null;
  if (__ASKR_DEVELOPMENT_BUILD__) {
    adjustOwnershipDiagnostic('timers', -1);
  }
}

function startTimerSlot(slot: TimerSlot): void {
  slot.id = setInterval(() => {
    if (allPredicatesPass(slot.predicates)) {
      slot.callback();
    }
  }, slot.intervalMs ?? slot.pendingIntervalMs);
  if (__ASKR_DEVELOPMENT_BUILD__) {
    adjustOwnershipDiagnostic('timers', 1);
  }
}

function commitTimerSlot(instance: ComponentInstance, slot: TimerSlot): void {
  const intervalChanged = slot.intervalMs !== slot.pendingIntervalMs;

  slot.callback = slot.pendingCallback;
  slot.predicates = slot.pendingPredicates;

  if (slot.id === null || intervalChanged) {
    stopTimerSlot(slot);
    slot.intervalMs = slot.pendingIntervalMs;
    startTimerSlot(slot);
  }

  if (!slot.cleanupRegistered) {
    slot.cleanupRegistered = true;
    ownCleanup(instance.ownership, () => {
      stopTimerSlot(slot);
      slot.cleanupRegistered = false;
    });
  }
}

/** Run `fn` on an owned interval for the current component's lifetime, optionally gated by `options.when`. */
export function timer(
  intervalMs: number,
  fn: () => void,
  options?: TimerOptions
): void {
  const instance = getCurrentComponentInstance();
  if (!instance) {
    return;
  }

  const index = claimHookIndex(instance, 'timer');
  const predicates = normalizePredicates(options?.when);
  const slot = getLifecycleSlot<TimerSlot>(instance, index, 'timer', () => ({
    kind: 'timer',
    id: null,
    intervalMs: null,
    pendingIntervalMs: intervalMs,
    callback: fn,
    predicates,
    pendingCallback: fn,
    pendingPredicates: predicates,
    cleanupRegistered: false,
  }));

  slot.pendingIntervalMs = intervalMs;
  slot.pendingCallback = fn;
  slot.pendingPredicates = predicates;

  registerCommitOperation(() => {
    commitTimerSlot(instance, slot);
  });
}

/** Runs an owned task after commit. */
export function task(
  fn: () => void | (() => void) | PromiseLike<void | (() => void)>
): void {
  const instance = getCurrentComponentInstance();
  if (!instance) {
    return;
  }

  const index = claimHookIndex(instance, 'task');
  const slot = getLifecycleSlot<
    LifecycleSlot & {
      kind: 'task';
      started: boolean;
      task: typeof fn;
    }
  >(instance, index, 'task', () => ({
    kind: 'task',
    started: false,
    task: fn,
  }));

  if (!slot.started) {
    slot.task = fn;
    registerCommitOperation(async () => {
      if (slot.started) {
        return;
      }

      slot.started = true;
      return await slot.task();
    });
  }
}

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
    ownCleanup(instance.ownership, () => {
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

/**
 * Capture the result of a synchronous expression at call time and return a
 * thunk that returns the captured value later. This is a low-level helper for
 * cases where async continuations need to observe a snapshot of values at the
 * moment scheduling occurred.
 *
 * Usage (public API):
 * const snapshot = capture(() => someState());
 * Promise.resolve().then(() => { use(snapshot()); });
 */
export function capture<T>(fn: () => T): () => T {
  const value = fn();
  return () => value;
}
