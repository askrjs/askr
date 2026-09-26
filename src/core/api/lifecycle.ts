/**
 * Component lifecycle hooks: work that starts after a render commits and
 * ends with the component. Each is a no-op outside a component render and
 * never starts on the server.
 */

import { isRouteActivityActive } from '../../common/route-activity';
import { Computation, untrack } from '../reactive/graph';
import { effectScheduler } from '../reactive/scheduler';
import {
  currentComponent,
  hookSlot,
  onCommit,
  reportLifecycleError,
  withOwner,
  type ComponentInstance,
} from './hooks';

// ---------------------------------------------------------------------------
// task()

/** Run `fn` once after the component's first commit; a returned function is its cleanup. */
export function task(
  fn: () => void | (() => void) | PromiseLike<void | (() => void)>
): void {
  const instance = currentComponent();
  if (!instance) return;
  const slot = hookSlot(instance, 'task', () => ({ started: false, fn }));
  if (slot.started || instance.server) return;
  slot.fn = fn;
  onCommit(instance, () => {
    if (slot.started) return;
    slot.started = true;
    try {
      return slot.fn();
    } catch (error) {
      return Promise.reject(error);
    }
  });
}

/** Snapshot `fn()` now and return a thunk that yields that value later. */
export function capture<T>(fn: () => T): () => T {
  const value = fn();
  return () => value;
}

// ---------------------------------------------------------------------------
// watch()

/** A callable reactive source accepted by {@link watch}. */
export type WatchSource<T> = () => T;

export type WatchValues<TSources extends readonly WatchSource<unknown>[]> = {
  -readonly [TIndex in keyof TSources]: ReturnType<TSources[TIndex]>;
};

export interface WatchContext<TValue> {
  readonly initial: boolean;
  readonly previous: TValue | undefined;
  readonly signal: AbortSignal;
}

export type WatchCallback<TValue> = (
  value: TValue,
  context: WatchContext<TValue>
) => void | (() => void) | PromiseLike<void>;

interface WatchSlot<TValue> {
  sources: readonly WatchSource<unknown>[];
  callback: WatchCallback<TValue>;
  effect: Computation<void> | null;
  controller: AbortController | null;
  cleanup: (() => void) | null;
  observed: boolean;
  value: TValue | undefined;
}

function sameValues(previous: unknown, next: unknown): boolean {
  if (Array.isArray(previous) && Array.isArray(next)) {
    if (previous.length !== next.length) return false;
    return previous.every((value, index) => Object.is(value, next[index]));
  }
  return Object.is(previous, next);
}

function stopGeneration(slot: WatchSlot<unknown>): void {
  const controller = slot.controller;
  slot.controller = null;
  if (controller && !controller.signal.aborted) controller.abort();
  const cleanup = slot.cleanup;
  slot.cleanup = null;
  cleanup?.();
}

function observe<TValue>(
  instance: ComponentInstance,
  slot: WatchSlot<TValue>,
  value: TValue,
  previous: TValue | undefined
): void {
  stopGeneration(slot as WatchSlot<unknown>);
  const controller = new AbortController();
  slot.controller = controller;
  const initial = !slot.observed;
  slot.observed = true;
  let result: ReturnType<WatchCallback<TValue>>;
  try {
    result = withOwner(instance, () =>
      slot.callback(value, { initial, previous, signal: controller.signal })
    );
  } catch (error) {
    reportLifecycleError(instance, error);
    return;
  }
  if (typeof result === 'function') {
    slot.cleanup = result;
  } else if (result && typeof result.then === 'function') {
    Promise.resolve(result).catch((error) => {
      if (!controller.signal.aborted) reportLifecycleError(instance, error);
    });
  }
}

function startWatch<TValue>(
  instance: ComponentInstance,
  slot: WatchSlot<TValue>
): void {
  if (slot.effect) {
    // New sources from the latest render: re-read them.
    slot.effect.invalidate();
    return;
  }
  const effect = new Computation<void>(
    instance,
    () => {
      let value: TValue;
      try {
        const values = slot.sources.map((source) => source());
        value = (values.length === 1 ? values[0] : values) as TValue;
      } catch (error) {
        reportLifecycleError(instance, error);
        return;
      }
      if (slot.observed && sameValues(slot.value, value)) return;
      const previous = slot.value;
      slot.value = value;
      // The callback's own reads are not dependencies of the watch.
      untrack(() => observe(instance, slot, value, previous));
    },
    effectScheduler('post', instance.depth),
    null
  );
  slot.effect = effect;
  instance.onCleanup(() => {
    stopGeneration(slot as WatchSlot<unknown>);
    slot.effect = null;
  });
  effect.run();
}

/** Observe a source (or a tuple of sources) after commit and whenever it changes. */
export function watch<TValue>(
  source: WatchSource<TValue>,
  callback: WatchCallback<TValue>
): void;
export function watch<const TSources extends readonly WatchSource<unknown>[]>(
  sources: TSources extends WatchSource<unknown> ? never : TSources,
  callback: WatchCallback<WatchValues<TSources>>
): void;
export function watch<TValue>(
  sourceOrSources: WatchSource<TValue> | readonly WatchSource<unknown>[],
  callback: WatchCallback<TValue>
): void {
  const instance = currentComponent();
  if (!instance) return;
  const sources = (
    Array.isArray(sourceOrSources) ? sourceOrSources : [sourceOrSources]
  ) as readonly WatchSource<unknown>[];
  const slot = hookSlot<WatchSlot<TValue>>(instance, 'watch', () => ({
    sources,
    callback,
    effect: null,
    controller: null,
    cleanup: null,
    observed: false,
    value: undefined,
  }));
  if (instance.server) return;
  onCommit(instance, () => {
    slot.sources = sources;
    slot.callback = callback;
    startWatch(instance, slot);
  });
}

// ---------------------------------------------------------------------------
// timer() and routeActive()

/** A gating condition for {@link timer}; `true` means active. */
export type ActivityPredicate = () => boolean;

export interface TimerOptions {
  when?: ActivityPredicate | readonly ActivityPredicate[];
}

function predicatesOf(
  when: TimerOptions['when']
): readonly ActivityPredicate[] {
  if (!when) return [];
  return typeof when === 'function' ? [when] : when;
}

/** Run `fn` every `intervalMs` while the component lives and `options.when` passes. */
export function timer(
  intervalMs: number,
  fn: () => void,
  options?: TimerOptions
): void {
  const instance = currentComponent();
  if (!instance) return;
  const slot = hookSlot(instance, 'timer', () => ({
    id: null as ReturnType<typeof setInterval> | null,
    intervalMs: null as number | null,
    callback: fn,
    predicates: predicatesOf(options?.when),
  }));
  if (instance.server) return;
  const predicates = predicatesOf(options?.when);
  onCommit(instance, () => {
    slot.callback = fn;
    slot.predicates = predicates;
    if (slot.id !== null && slot.intervalMs === intervalMs) return;
    const first = slot.id === null && slot.intervalMs === null;
    if (slot.id !== null) clearInterval(slot.id);
    slot.intervalMs = intervalMs;
    slot.id = setInterval(() => {
      if (slot.predicates.every((predicate) => predicate())) slot.callback();
    }, intervalMs);
    if (first) {
      instance.onCleanup(() => {
        if (slot.id !== null) clearInterval(slot.id);
        slot.id = null;
      });
    }
  });
}

/** An {@link ActivityPredicate} that is true while the current route matches. */
export function routeActive(
  pathOrPaths: string | readonly string[]
): ActivityPredicate {
  return () => isRouteActivityActive(pathOrPaths);
}

// ---------------------------------------------------------------------------
// on()

export type ListenerTarget =
  | EventTarget
  | (() => EventTarget | null | undefined);

type ListenerOptions = boolean | AddEventListenerOptions | undefined;

function sameOptions(a: ListenerOptions, b: ListenerOptions): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || !a || !b) return false;
  return (
    a.capture === b.capture &&
    a.once === b.once &&
    a.passive === b.passive &&
    a.signal === b.signal
  );
}

/** Attach an event listener to `target` for the component's lifetime. */
export function on(
  target: ListenerTarget,
  event: string,
  handler: EventListener,
  options?: ListenerOptions
): void {
  const instance = currentComponent();
  if (!instance) return;
  const slot = hookSlot(instance, 'on', () => {
    const created = {
      target: null as EventTarget | null,
      event,
      options: undefined as ListenerOptions,
      handler,
      attached: false,
      listener: ((evt: Event) => {
        created.handler.call(created.target, evt);
      }) as EventListener,
    };
    return created;
  });
  if (instance.server) return;
  onCommit(instance, () => {
    slot.handler = handler;
    const resolved = typeof target === 'function' ? (target() ?? null) : target;
    if (
      slot.attached &&
      slot.target === resolved &&
      slot.event === event &&
      sameOptions(slot.options, options)
    ) {
      return;
    }
    const first = !slot.attached && slot.target === null;
    if (slot.attached && slot.target) {
      slot.target.removeEventListener(slot.event, slot.listener, slot.options);
    }
    slot.attached = false;
    slot.target = resolved;
    slot.event = event;
    slot.options = options;
    if (resolved) {
      resolved.addEventListener(event, slot.listener, options);
      slot.attached = true;
    }
    if (first) {
      instance.onCleanup(() => {
        if (slot.attached && slot.target) {
          slot.target.removeEventListener(
            slot.event,
            slot.listener,
            slot.options
          );
        }
        slot.attached = false;
      });
    }
  });
}
