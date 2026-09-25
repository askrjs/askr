import { incDevCounter } from '../../runtime';
import { isBenchMetricScopeActive, recordBenchCounter } from '../../runtime';
import {
  isEventDelegationEnabled,
  addDelegatedListener,
  addFreshDelegatedListener,
  getDelegatedHandlerForElement,
  getDelegatedHandlersForElement,
  updateDelegatedListener,
  removeDelegatedListener,
  isDelegatedEvent,
} from './events';
import { elementListeners, type ListenerMapEntry } from '../ownership/cleanup';
import {
  createMutableWrappedHandler,
  getEventListenerKey,
  getEventListenerOptions,
  type ParsedEventProp,
} from '../utils';
import {
  getCurrentHydrationListenerTransaction,
  hasStagedHydrationListener,
  stageHydrationListener,
} from '../hydration/listener-transaction';
declare const __ASKR_BENCH_BUILD__: boolean;
const BENCH_BUILD_ENABLED = __ASKR_BENCH_BUILD__;

function usesDelegation(eventName: string, capture: boolean): boolean {
  return !capture && isEventDelegationEnabled() && isDelegatedEvent(eventName);
}

export function addTrackedListener(
  el: Element,
  eventName: string,
  handler: EventListener,
  capture = false,
  fresh = false
): void {
  if (
    !hasStagedHydrationListener(el, eventName, capture) &&
    stageHydrationListener({
      // Hydrated listeners publish through the same delegated/direct policy
      // as client-rendered ones, so propagation does not depend on whether
      // a node was hydrated or created on the client.
      kind: usesDelegation(eventName, capture) ? 'delegated' : 'direct',
      target: el,
      eventName,
      capture,
      publish: () =>
        attachTrackedListener(el, eventName, handler, capture, fresh),
      rollback: () => removeTrackedListener(el, eventName, capture),
    })
  ) {
    return;
  }

  attachTrackedListener(el, eventName, handler, capture, fresh);
}

function attachTrackedListener(
  el: Element,
  eventName: string,
  handler: EventListener,
  capture: boolean,
  fresh: boolean
): void {
  const listenerKey = getEventListenerKey(eventName, capture);

  if (usesDelegation(eventName, capture)) {
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
/** Reconcile one event prop without changing the caller's prop iteration order. */
export function syncElementListener(
  el: Element,
  eventProp: ParsedEventProp,
  listenerKey: string,
  value: EventListener,
  existingListeners: Map<string, ListenerMapEntry> | undefined
): 'direct' | 'delegated' | undefined {
  const { eventName, capture: eventCapture } = eventProp;
  const useDelegation = usesDelegation(eventName, eventCapture);
  if (
    getCurrentHydrationListenerTransaction() &&
    !existingListeners?.has(listenerKey) &&
    !getDelegatedHandlerForElement(el, eventName)
  ) {
    if (!hasStagedHydrationListener(el, eventName, eventCapture)) {
      stageHydrationListener({
        kind: useDelegation ? 'delegated' : 'direct',
        target: el,
        eventName,
        capture: eventCapture,
        publish: () =>
          attachTrackedListener(
            el,
            eventName,
            value as EventListener,
            eventCapture,
            false
          ),
        rollback: () => removeTrackedListener(el, eventName, eventCapture),
      });
    }
    return;
  }
  if (useDelegation) {
    const existingDelegated = getDelegatedHandlerForElement(el, eventName);
    if (existingDelegated?.original === value) {
      return 'delegated';
    }

    if (
      existingDelegated &&
      updateDelegatedListener(
        el,
        eventName,
        value as EventListener,
        value as EventListener,
        undefined
      )
    ) {
      return 'delegated';
    }

    addDelegatedListener(
      el,
      eventName,
      value as EventListener,
      value as EventListener,
      undefined
    );
    return 'delegated';
  }

  const existing = existingListeners?.get(listenerKey);

  if (existing && existing.original === value) {
    return 'direct';
  }

  if (existing) {
    if (
      useDelegation &&
      existing.isDelegated &&
      updateDelegatedListener(
        el,
        eventName,
        value as EventListener,
        value as EventListener,
        undefined
      )
    ) {
      existing.handler = value as EventListener;
      existing.original = value as EventListener;
      existing.options = undefined;
      return 'direct';
    }

    if (!useDelegation && !existing.isDelegated && existing.updateHandler) {
      existing.updateHandler(value as EventListener);
      existing.original = value as EventListener;
      return 'direct';
    }

    detachListenerEntry(el, existing);
  }

  const options = getEventListenerOptions(eventName, eventCapture);
  const mutableHandler = createMutableWrappedHandler(
    value as EventListener,
    true
  );
  const trackedHandler = mutableHandler.handler;

  if (options !== undefined) {
    el.addEventListener(eventName, trackedHandler, options);
  } else {
    el.addEventListener(eventName, trackedHandler);
  }
  incDevCounter('listenerAdds');

  const listenerEntry = {
    handler: trackedHandler,
    original: value as EventListener,
    eventName,
    options,
    isDelegated: false,
    updateHandler: mutableHandler?.updateHandler,
  };
  if (!elementListeners.has(el)) {
    elementListeners.set(el, new Map());
  }
  elementListeners.get(el)!.set(listenerKey, listenerEntry);
  return 'direct';
}

function detachListenerEntry(el: Element, entry: ListenerMapEntry): void {
  if (entry.isDelegated) {
    removeDelegatedListener(el, entry.eventName);
  } else if (entry.options !== undefined) {
    el.removeEventListener(entry.eventName, entry.handler, entry.options);
  } else {
    el.removeEventListener(entry.eventName, entry.handler);
  }
}

/** Remove an explicitly cleared prop before the next prop is processed. */
export function removeElementListener(
  el: Element,
  listeners: Map<string, ListenerMapEntry> | undefined,
  listenerKey: string
): boolean {
  if (!listeners?.has(listenerKey)) return false;
  const entry = listeners.get(listenerKey)!;
  incDevCounter('listenerRemoves');
  detachListenerEntry(el, entry);
  listeners.delete(listenerKey);
  return true;
}

/** Prune listeners after scalar attributes, preserving tracked-before-delegated order. */
export function pruneElementListeners(
  el: Element,
  existingListeners: Map<string, ListenerMapEntry> | undefined,
  desiredListenerKeys: Set<string> | null,
  desiredDelegatedEventNames: Set<string> | null
): void {
  if (existingListeners && existingListeners.size > 0) {
    if (desiredListenerKeys === null) {
      existingListeners.forEach((entry) => {
        incDevCounter('listenerRemoves');
        detachListenerEntry(el, entry);
      });
      elementListeners.delete(el);
    } else {
      existingListeners.forEach((entry, listenerKey) => {
        if (!desiredListenerKeys.has(listenerKey)) {
          incDevCounter('listenerRemoves');
          detachListenerEntry(el, entry);
          existingListeners.delete(listenerKey);
        }
      });
      if (existingListeners.size === 0) elementListeners.delete(el);
    }
  }

  const delegatedHandlers = getDelegatedHandlersForElement(el);
  if (delegatedHandlers && delegatedHandlers.size > 0) {
    if (desiredDelegatedEventNames === null) {
      for (const eventName of delegatedHandlers.keys()) {
        removeDelegatedListener(el, eventName);
      }
    } else {
      for (const eventName of delegatedHandlers.keys()) {
        if (!desiredDelegatedEventNames.has(eventName)) {
          removeDelegatedListener(el, eventName);
        }
      }
    }
  }
}
