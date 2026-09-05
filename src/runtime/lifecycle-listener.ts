import { getComponentLifecycleSlot as getLifecycleSlot } from './component-capabilities';
import { resolveListenerTarget } from '../resources/browser-activity';
import { ownCleanup } from './ownership';
import { claimHookIndex, getCurrentComponentInstance } from './component-scope';
import {
  registerCommitOperation,
  type ComponentInstance,
} from './component-internal';
import { LifecycleSlot } from './lifecycle-policy';
declare const __ASKR_DEVELOPMENT_BUILD__: boolean;

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
  const resolvedTarget = resolveListenerTarget(slot.pendingTarget);

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
    ownCleanup(instance.owner, () => {
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
export {
  ListenerOptions,
  NormalizedListenerOptions,
  ListenerSlot,
  normalizeListenerOptions,
  listenerOptionsEqual,
  detachListenerSlot,
  commitListenerSlot,
};
