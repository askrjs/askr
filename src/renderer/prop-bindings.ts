import { logger } from '../common/logger';
import { incDevCounter } from '../runtime';
import {
  createFineGrainedEffect,
  markFineGrainedEffectsDirtySource,
  type FineGrainedEffectHandle,
} from '../runtime';
import { isBenchMetricScopeActive, recordBenchCounter } from '../runtime';
import { incrementPerfMetric } from '../runtime';
import type { ReadableSource } from '../runtime';
import {
  isEventDelegationEnabled,
  addDelegatedListener,
  addFreshDelegatedListener,
  getDelegatedHandlerForElement,
  getDelegatedHandlersForElement,
  updateDelegatedListener,
  removeDelegatedListener,
  isDelegatedEvent,
} from '../runtime';
import { applyScalarPropValue, removeStaleAttributes } from './attributes';
import {
  elementListeners,
  elementReactivePropsCleanup,
  elementRefs,
  getElementReactivePropCleanupSize,
  getElementReactivePropsCleanupMap,
  REACTIVE_CHILDREN_KEY,
  type ReactivePropCleanupEntry,
  updateElementRef,
} from './cleanup';
import { getRuntimeEnv } from './env';
import type { DOMElement } from './types';
import {
  createMutableWrappedHandler,
  getEventListenerKey,
  getEventListenerOptions,
  isSkippedProp,
  parseEventProp,
} from './utils';
import {
  getCurrentHydrationListenerTransaction,
  hasStagedHydrationListener,
  stageHydrationListener,
} from './hydration-listener-transaction';

declare const __ASKR_BENCH_BUILD__: boolean;

const BENCH_BUILD_ENABLED = __ASKR_BENCH_BUILD__;

interface ReactivePropDescriptor {
  el: Element;
  propName: string;
  propFn: () => unknown;
  tagName: string;
  lastClassTokens: string[] | null;
}

const reactivePropRegistry = new Set<ReactivePropDescriptor>();
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

function isHydrationDirectListener(
  element: Element,
  listenerKey: string
): boolean {
  return hydrationDirectListeners.get(element)?.has(listenerKey) ?? false;
}

function clearHydrationDirectListener(
  element: Element,
  listenerKey: string
): void {
  const listeners = hydrationDirectListeners.get(element);
  listeners?.delete(listenerKey);
  if (listeners?.size === 0) {
    hydrationDirectListeners.delete(element);
  }
}

function addTrackedListener(
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

function removeTrackedListener(
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

export function markReactivePropsDirtySource(
  source: ReadableSource<unknown>
): void {
  markFineGrainedEffectsDirtySource(source);
}

function setupReactiveProp(
  el: Element,
  propName: string,
  propFn: () => unknown,
  tagName: string
): { cleanup: () => void; updateFn: (nextFn: () => unknown) => void } {
  const descriptor: ReactivePropDescriptor = {
    el,
    propName,
    propFn,
    tagName,
    lastClassTokens: null,
  };

  let effectHandle: FineGrainedEffectHandle<unknown> | null = null;

  reactivePropRegistry.add(descriptor);
  effectHandle = createFineGrainedEffect({
    lane: 'reactive',
    compute: () => descriptor.propFn(),
    commit: (value, previousValue) => {
      incrementPerfMetric('reactivePropReevaluations');
      applyScalarPropValue(
        el,
        propName,
        value,
        tagName,
        previousValue,
        descriptor
      );
    },
    equals: (previousValue, nextValue) => {
      if (Object.is(previousValue, nextValue)) {
        incrementPerfMetric('skippedDomPropWrites');
        return true;
      }
      return false;
    },
    onError: (err) => {
      if (getRuntimeEnv().NODE_ENV !== 'production') {
        logger.warn('[Askr] Reactive prop update failed:', err);
      }
    },
  });

  if (BENCH_BUILD_ENABLED && isBenchMetricScopeActive('coldCreate')) {
    recordBenchCounter('reactivePropsMounted');
  }

  const cleanup = () => {
    reactivePropRegistry.delete(descriptor);
    effectHandle?.cleanup();
    effectHandle = null;
  };

  const updateFn = (nextFn: () => unknown): void => {
    if (!effectHandle) {
      return;
    }

    descriptor.propFn = nextFn;

    try {
      effectHandle.updateCompute(nextFn);
    } catch (err) {
      if (getRuntimeEnv().NODE_ENV !== 'production') {
        logger.warn('[Askr] Reactive prop update failed:', err);
      }
    }
  };

  return {
    cleanup,
    updateFn,
  };
}

function getOrCreateReactivePropsCleanupMap(
  el: Element
): Map<string, ReactivePropCleanupEntry> {
  return getElementReactivePropsCleanupMap(el, true)!;
}

/** @internal Create a standalone reactive prop entry for rollback restoration. */
export function createReactivePropCleanupEntry(
  el: Element,
  propName: string,
  propFn: () => unknown,
  tagName: string
): ReactivePropCleanupEntry {
  const reactive = setupReactiveProp(el, propName, propFn, tagName);

  return {
    cleanup: reactive.cleanup,
    updateFn: (nextValue) => {
      reactive.updateFn(nextValue as () => unknown);
    },
    restoreFn: (nextValue) =>
      createReactivePropCleanupEntry(
        el,
        propName,
        nextValue as () => unknown,
        tagName
      ),
    fnRef: propFn,
  };
}

export function hasTrackedElementPropBindings(el: Element): boolean {
  const existingListeners = elementListeners.get(el);
  return (
    (existingListeners !== undefined && existingListeners.size > 0) ||
    getElementReactivePropCleanupSize(el) > 0
  );
}

export function hasAnyElementBindingState(el: Element): boolean {
  return (
    hasTrackedElementPropBindings(el) ||
    getDelegatedHandlersForElement(el) !== undefined ||
    elementRefs.has(el)
  );
}

export function applyMatchingElementBindings(
  el: Element,
  props: Record<string, unknown>
): void {
  if (Object.prototype.hasOwnProperty.call(props, 'ref')) {
    updateElementRef(el, props.ref);
  }

  for (const key in props) {
    const eventProp = parseEventProp(key);
    if (!eventProp) continue;
    const value = props[key];
    if (typeof value === 'function') {
      addTrackedListener(
        el,
        eventProp.eventName,
        value as EventListener,
        eventProp.capture
      );
    }
  }
}

/** @internal Attach stateful bindings to a newly cloned blueprint element. */
export function applyFreshElementBindings(
  el: Element,
  props: Record<string, unknown>
): void {
  if (Object.prototype.hasOwnProperty.call(props, 'ref')) {
    updateElementRef(el, props.ref);
  }

  for (const key in props) {
    const eventProp = parseEventProp(key);
    if (eventProp) {
      const value = props[key];
      if (typeof value === 'function') {
        addTrackedListener(
          el,
          eventProp.eventName,
          value as EventListener,
          eventProp.capture,
          true
        );
      }
    }
  }
}

export function applyPropsToElement(
  el: Element,
  props: Record<string, unknown>,
  tagName: string,
  isHydrationSkipped: (el: Element) => boolean
): void {
  if (isHydrationSkipped(el)) {
    return;
  }

  for (const key in props) {
    const value = props[key];
    if (key === 'ref') {
      updateElementRef(el, value);
      continue;
    }
    if (isSkippedProp(key)) continue;
    if (key === 'dangerouslySetInnerHTML') {
      applyScalarPropValue(el, key, value, tagName);
      continue;
    }
    if (value === undefined || value === null || value === false) continue;

    const eventProp = parseEventProp(key);
    if (eventProp) {
      addTrackedListener(
        el,
        eventProp.eventName,
        value as EventListener,
        eventProp.capture
      );
      continue;
    }

    if (typeof value === 'function' && key !== 'ref') {
      getOrCreateReactivePropsCleanupMap(el).set(
        key,
        createReactivePropCleanupEntry(el, key, value as () => unknown, tagName)
      );
      continue;
    }

    applyScalarPropValue(el, key, value, tagName);
  }
}

/** @internal Attach only stateful bindings to a cloned intrinsic blueprint. */
export function applyDynamicElementBindings(
  el: Element,
  props: Record<string, unknown>,
  tagName: string
): void {
  if (Object.prototype.hasOwnProperty.call(props, 'ref')) {
    updateElementRef(el, props.ref);
  }

  for (const key in props) {
    const value = props[key];
    if (isSkippedProp(key)) {
      continue;
    }

    const eventProp = parseEventProp(key);
    if (eventProp) {
      addTrackedListener(
        el,
        eventProp.eventName,
        value as EventListener,
        eventProp.capture
      );
      continue;
    }

    if (typeof value === 'function') {
      getOrCreateReactivePropsCleanupMap(el).set(
        key,
        createReactivePropCleanupEntry(el, key, value as () => unknown, tagName)
      );
    }
  }
}

export function syncElementPropBindings(
  el: Element,
  domVNode: DOMElement,
  props: Record<string, unknown>,
  usesReactiveChildren: boolean
): void {
  const existingListeners = elementListeners.get(el);
  const existingReactiveProps = getElementReactivePropsCleanupMap(el);

  let desiredListenerKeys: Set<string> | null = null;
  let desiredDelegatedEventNames: Set<string> | null = null;
  let desiredReactivePropNames: Set<string> | null = null;

  if (usesReactiveChildren) {
    (desiredReactivePropNames ??= new Set()).add(REACTIVE_CHILDREN_KEY);
  }

  for (const key in props) {
    const value = props[key];
    if (key === 'ref') continue;
    if (isSkippedProp(key)) continue;

    if (key === 'dangerouslySetInnerHTML') {
      const existingEntry = existingReactiveProps?.get(key);
      if (existingEntry) {
        existingEntry.cleanup();
        existingReactiveProps?.delete(key);
      }
      applyScalarPropValue(el, key, value, domVNode.type as string);
      continue;
    }

    const eventProp = parseEventProp(key);
    const eventName = eventProp?.eventName;
    const eventCapture = eventProp?.capture ?? false;
    const listenerKey =
      eventName === undefined
        ? null
        : getEventListenerKey(eventName, eventCapture);

    if (value === undefined || value === null || value === false) {
      if (listenerKey && existingListeners?.has(listenerKey)) {
        const entry = existingListeners.get(listenerKey)!;
        incDevCounter('listenerRemoves');
        if (entry.isDelegated) {
          removeDelegatedListener(el, entry.eventName);
        } else {
          if (entry.options !== undefined) {
            el.removeEventListener(
              entry.eventName,
              entry.handler,
              entry.options
            );
          } else {
            el.removeEventListener(entry.eventName, entry.handler);
          }
        }
        existingListeners.delete(listenerKey);
      } else {
        const entry = existingReactiveProps?.get(key);
        if (entry) {
          entry.cleanup();
          existingReactiveProps?.delete(key);
        } else {
          applyScalarPropValue(el, key, value, domVNode.type as string);
        }
      }
      continue;
    }

    if (typeof value === 'function' && !eventProp && key !== 'ref') {
      const existingEntry = existingReactiveProps?.get(key);
      if (existingReactiveProps && existingReactiveProps.size > 0) {
        (desiredReactivePropNames ??= new Set()).add(key);
      }

      if (existingEntry && existingEntry.fnRef === value) {
        continue;
      }

      if (existingEntry?.updateFn) {
        existingEntry.updateFn(value as () => unknown);
        existingEntry.fnRef = value as () => unknown;
        continue;
      }

      if (existingEntry) {
        existingEntry.cleanup();
      }

      getOrCreateReactivePropsCleanupMap(el).set(
        key,
        createReactivePropCleanupEntry(
          el,
          key,
          value as () => unknown,
          domVNode.type as string
        )
      );
      continue;
    }

    const existingReactiveEntry = existingReactiveProps?.get(key);
    if (existingReactiveEntry) {
      existingReactiveEntry.cleanup();
      existingReactiveProps?.delete(key);
    }

    if (eventProp && listenerKey) {
      const eventName = eventProp.eventName;
      const eventCapture = eventProp.capture;
      const preserveHydrationDirect =
        existingListeners?.get(listenerKey)?.isDelegated === false &&
        isHydrationDirectListener(el, listenerKey);
      if (
        getCurrentHydrationListenerTransaction() &&
        !existingListeners?.has(listenerKey) &&
        !getDelegatedHandlerForElement(el, eventName) &&
        !isHydrationDirectListener(el, listenerKey)
      ) {
        if (!hasStagedHydrationListener(el, eventName, eventCapture)) {
          stageHydrationListener({
            kind: 'direct',
            target: el,
            eventName,
            capture: eventCapture,
            publish: () =>
              addTrackedListener(
                el,
                eventName,
                value as EventListener,
                eventCapture,
                false,
                true
              ),
            rollback: () => {
              removeTrackedListener(el, eventName, eventCapture);
              clearHydrationDirectListener(el, listenerKey);
            },
          });
        }
        continue;
      }
      if (
        hydrationDirectListenerDepth > 0 &&
        !existingListeners?.has(listenerKey) &&
        !getDelegatedHandlerForElement(el, eventName)
      ) {
        addTrackedListener(
          el,
          eventName,
          value as EventListener,
          eventCapture,
          false,
          true
        );
        continue;
      }
      const useDelegation =
        !preserveHydrationDirect &&
        !eventCapture &&
        isEventDelegationEnabled() &&
        isDelegatedEvent(eventName);
      if (useDelegation) {
        (desiredDelegatedEventNames ??= new Set()).add(eventName);
      }

      if (useDelegation) {
        const existingDelegated = getDelegatedHandlerForElement(el, eventName);
        if (existingDelegated?.original === value) {
          continue;
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
          continue;
        }

        addDelegatedListener(
          el,
          eventName,
          value as EventListener,
          value as EventListener,
          undefined
        );
        continue;
      }

      (desiredListenerKeys ??= new Set()).add(listenerKey);

      const existing = existingListeners?.get(listenerKey);

      if (existing && existing.original === value) {
        continue;
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
          continue;
        }

        if (!useDelegation && !existing.isDelegated && existing.updateHandler) {
          existing.updateHandler(value as EventListener);
          existing.original = value as EventListener;
          continue;
        }

        if (existing.isDelegated) {
          removeDelegatedListener(el, existing.eventName);
        } else {
          if (existing.options !== undefined) {
            el.removeEventListener(
              existing.eventName,
              existing.handler,
              existing.options
            );
          } else {
            el.removeEventListener(existing.eventName, existing.handler);
          }
        }
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
    } else {
      applyScalarPropValue(el, key, value, domVNode.type as string);
    }
  }

  removeStaleAttributes(el, domVNode, props);

  if (existingListeners && existingListeners.size > 0) {
    if (desiredListenerKeys === null) {
      existingListeners.forEach((entry) => {
        incDevCounter('listenerRemoves');
        if (entry.isDelegated) {
          removeDelegatedListener(el, entry.eventName);
        } else {
          if (entry.options !== undefined) {
            el.removeEventListener(
              entry.eventName,
              entry.handler,
              entry.options
            );
          } else {
            el.removeEventListener(entry.eventName, entry.handler);
          }
        }
      });
      elementListeners.delete(el);
    } else {
      existingListeners.forEach((entry, listenerKey) => {
        if (!desiredListenerKeys.has(listenerKey)) {
          incDevCounter('listenerRemoves');
          if (entry.isDelegated) {
            removeDelegatedListener(el, entry.eventName);
          } else {
            if (entry.options !== undefined) {
              el.removeEventListener(
                entry.eventName,
                entry.handler,
                entry.options
              );
            } else {
              el.removeEventListener(entry.eventName, entry.handler);
            }
          }
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

  if (existingReactiveProps && existingReactiveProps.size > 0) {
    if (desiredReactivePropNames === null) {
      existingReactiveProps.forEach((entry) => {
        entry.cleanup();
      });
      elementReactivePropsCleanup.delete(el);
    } else {
      existingReactiveProps.forEach((entry, key) => {
        if (!desiredReactivePropNames.has(key)) {
          entry.cleanup();
          existingReactiveProps.delete(key);
        }
      });
      if (existingReactiveProps.size === 0) {
        elementReactivePropsCleanup.delete(el);
      }
    }
  }
}
