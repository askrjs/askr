import { incDevCounter } from '../runtime';
import { isBenchMetricScopeActive, recordBenchCounter } from '../runtime';
import {
  isEventDelegationEnabled,
  addDelegatedListener,
  addFreshDelegatedListener,
  getDelegatedHandlerForElement,
  removeDelegatedListener,
  isDelegatedEvent,
} from './events';
import { elementListeners } from './cleanup';
import {
  createMutableWrappedHandler,
  getEventListenerKey,
  getEventListenerOptions,
} from './utils';
import {
  hasStagedHydrationListener,
  stageHydrationListener,
} from './hydration-listener-transaction';
declare const __ASKR_BENCH_BUILD__: boolean;
const BENCH_BUILD_ENABLED = __ASKR_BENCH_BUILD__;

const hydrationDirectListeners = new WeakMap<Element, Set<string>>();

let hydrationDirectListenerDepth = 0;

export function beginHydrationDirectListenerMode(): void {
  hydrationDirectListenerDepth += 1;
}

export function endHydrationDirectListenerMode(): void {
  hydrationDirectListenerDepth = Math.max(0, hydrationDirectListenerDepth - 1);
}

function markHydrationDirectListener(
  element: Element,
  listenerKey: string
): void {
  let listeners = hydrationDirectListeners.get(element);
  if (!listeners) {
    listeners = new Set();
    hydrationDirectListeners.set(element, listeners);
  }
  listeners.add(listenerKey);
}

export function isHydrationDirectListener(
  element: Element,
  listenerKey: string
): boolean {
  return hydrationDirectListeners.get(element)?.has(listenerKey) ?? false;
}

export function clearHydrationDirectListener(
  element: Element,
  listenerKey: string
): void {
  const listeners = hydrationDirectListeners.get(element);
  listeners?.delete(listenerKey);
  if (listeners?.size === 0) {
    hydrationDirectListeners.delete(element);
  }
}

export function addTrackedListener(
  el: Element,
  eventName: string,
  handler: EventListener,
  capture = false,
  fresh = false,
  forceDirect = false
): void {
  const effectiveForceDirect = forceDirect || hydrationDirectListenerDepth > 0;
  const useDelegation =
    !effectiveForceDirect &&
    !capture &&
    isEventDelegationEnabled() &&
    isDelegatedEvent(eventName);
  const listenerKey = getEventListenerKey(eventName, capture);

  if (effectiveForceDirect && isHydrationDirectListener(el, listenerKey)) {
    const existing = elementListeners.get(el)?.get(listenerKey);
    if (existing) {
      existing.updateHandler?.(handler);
      existing.original = handler;
      return;
    }
  }

  if (
    !effectiveForceDirect &&
    !hasStagedHydrationListener(el, eventName, capture) &&
    stageHydrationListener({
      // Hydrated listeners publish as direct listeners. This keeps the
      // initial SSR-to-client handoff independent of delegated-container
      // event propagation, which is not consistent across browser hosts.
      kind: 'direct',
      target: el,
      eventName,
      capture,
      publish: () =>
        addTrackedListener(el, eventName, handler, capture, fresh, true),
      rollback: () => {
        removeTrackedListener(el, eventName, capture);
        clearHydrationDirectListener(el, listenerKey);
      },
    })
  ) {
    return;
  }

  if (useDelegation) {
    if (fresh) {
      addFreshDelegatedListener(el, eventName, handler, handler, undefined);
    } else {
      addDelegatedListener(el, eventName, handler, handler, undefined);
    }
    if (BENCH_BUILD_ENABLED && isBenchMetricScopeActive('coldCreate')) {
      recordBenchCounter('listenerBindings');
    }
    return;
  }

  const options = getEventListenerOptions(eventName, capture);
  const mutableHandler = createMutableWrappedHandler(handler, true);
  const trackedHandler = mutableHandler.handler;

  if (options !== undefined) {
    el.addEventListener(eventName, trackedHandler, options);
  } else {
    el.addEventListener(eventName, trackedHandler);
  }
  incDevCounter('listenerAdds');
  if (effectiveForceDirect) {
    if (!capture && getDelegatedHandlerForElement(el, eventName)) {
      removeDelegatedListener(el, eventName);
    }
    markHydrationDirectListener(el, listenerKey);
  }

  if (!elementListeners.has(el)) {
    elementListeners.set(el, new Map());
  }
  elementListeners.get(el)!.set(listenerKey, {
    handler: trackedHandler,
    original: handler,
    eventName,
    options,
    isDelegated: false,
    updateHandler: mutableHandler?.updateHandler,
  });

  if (BENCH_BUILD_ENABLED && isBenchMetricScopeActive('coldCreate')) {
    recordBenchCounter('listenerBindings');
  }
}

export function removeTrackedListener(
  el: Element,
  eventName: string,
  capture: boolean
): void {
  if (!capture && getDelegatedHandlerForElement(el, eventName)) {
    removeDelegatedListener(el, eventName);
    return;
  }

  const listenerKey = getEventListenerKey(eventName, capture);
  const entry = elementListeners.get(el)?.get(listenerKey);
  if (!entry) {
    return;
  }

  if (entry.options !== undefined) {
    el.removeEventListener(entry.eventName, entry.handler, entry.options);
  } else {
    el.removeEventListener(entry.eventName, entry.handler);
  }
  incDevCounter('listenerRemoves');
  const listeners = elementListeners.get(el);
  listeners?.delete(listenerKey);
  if (listeners?.size === 0) {
    elementListeners.delete(el);
  }
}
export function isHydrationDirectListenerMode(): boolean {
  return hydrationDirectListenerDepth > 0;
}
