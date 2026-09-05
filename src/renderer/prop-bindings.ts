import { getDelegatedHandlersForElement } from './events';
import { applyScalarPropValue, removeStaleAttributes } from './attributes';
import {
  elementListeners,
  elementRefs,
  getElementReactivePropCleanupSize,
  getElementReactivePropsCleanupMap,
  REACTIVE_CHILDREN_KEY,
  updateElementRef,
} from './cleanup';
import type { DOMElement } from './types';
import { getEventListenerKey, isSkippedProp, parseEventProp } from './utils';
import {
  addTrackedListener,
  syncElementListener,
  removeElementListener,
  pruneElementListeners,
} from './prop-listeners';
export {
  beginHydrationDirectListenerMode,
  endHydrationDirectListenerMode,
} from './prop-listeners';
import {
  createReactivePropCleanupEntry,
  getOrCreateReactivePropsCleanupMap,
  syncReactivePropBinding,
  removeReactivePropBinding,
  pruneReactivePropBindings,
} from './reactive-prop-bindings';
export {
  createReactivePropCleanupEntry,
  markReactivePropsDirtySource,
} from './reactive-prop-bindings';

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
      removeReactivePropBinding(existingReactiveProps, key);
      applyScalarPropValue(el, key, value, domVNode.type as string);
      continue;
    }
    const eventProp = parseEventProp(key);
    const listenerKey = eventProp
      ? getEventListenerKey(eventProp.eventName, eventProp.capture)
      : null;

    if (value === undefined || value === null || value === false) {
      if (
        !(
          listenerKey &&
          removeElementListener(el, existingListeners, listenerKey)
        ) &&
        !removeReactivePropBinding(existingReactiveProps, key)
      )
        applyScalarPropValue(el, key, value, domVNode.type as string);
      continue;
    }
    if (typeof value === 'function' && !eventProp && key !== 'ref') {
      const existingEntry = existingReactiveProps?.get(key);
      if (existingReactiveProps && existingReactiveProps.size > 0) {
        (desiredReactivePropNames ??= new Set()).add(key);
      }
      syncReactivePropBinding(
        el,
        key,
        value as () => unknown,
        domVNode,
        existingEntry
      );
      continue;
    }

    removeReactivePropBinding(existingReactiveProps, key);
    if (eventProp && listenerKey) {
      const disposition = syncElementListener(
        el,
        eventProp,
        listenerKey,
        value as EventListener,
        existingListeners
      );
      if (disposition === 'direct') {
        (desiredListenerKeys ??= new Set()).add(listenerKey);
      } else if (disposition === 'delegated') {
        (desiredDelegatedEventNames ??= new Set()).add(eventProp.eventName);
      }
    } else {
      applyScalarPropValue(el, key, value, domVNode.type as string);
    }
  }

  removeStaleAttributes(el, domVNode, props);
  pruneElementListeners(
    el,
    existingListeners,
    desiredListenerKeys,
    desiredDelegatedEventNames
  );
  pruneReactivePropBindings(
    el,
    existingReactiveProps,
    desiredReactivePropNames
  );
}
