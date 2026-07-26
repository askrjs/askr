import {
  claimHookIndex,
  getCurrentComponentInstance,
  registerCommitOperation,
  type ComponentInstance,
} from './component';
import { isRouteActivityActive } from '../common/route-activity';
import { adjustOwnershipDiagnostic } from './ownership-diagnostics';

declare const __ASKR_DEVELOPMENT_BUILD__: boolean;

export type ActivityPredicate = () => boolean;

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

type LifecycleSlotKind = 'timer' | 'listener' | 'task';

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

export function routeActive(
  pathOrPaths: string | readonly string[]
): ActivityPredicate {
  return () => isRouteActivityActive(pathOrPaths);
}

export function documentVisible(): ActivityPredicate {
  return () =>
    typeof document === 'undefined' || document.visibilityState !== 'hidden';
}

export function windowFocused(): ActivityPredicate {
  return () =>
    typeof document === 'undefined' ||
    typeof document.hasFocus !== 'function' ||
    document.hasFocus();
}

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
    (instance.cleanupFns ??= []).push(() => {
      detachListenerSlot(slot);
      slot.cleanupRegistered = false;
    });
  }
}

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
    (instance.cleanupFns ??= []).push(() => {
      stopTimerSlot(slot);
      slot.cleanupRegistered = false;
    });
  }
}

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
