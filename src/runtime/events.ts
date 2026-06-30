/**
 * Event delegation system for Askr
 *
 * Provides efficient event handling by attaching listeners to a container
 * instead of individual elements. This significantly reduces memory usage
 * and improves performance when many elements have the same event type.
 *
 * Delegated handling is enabled by default. Tests and internal runtime code
 * can still disable or re-enable it when they need to exercise both modes.
 */

import { runRuntimeHandlerScope } from './access';
import { logger } from '../dev/logger';
import { incrementPerfMetric } from './perf-metrics';
import { incDevCounter } from './dev-namespace';

export interface DelegatedEventMap {
  click: MouseEvent;
  dblclick: MouseEvent;
  mousedown: MouseEvent;
  mouseup: MouseEvent;
  mouseover: MouseEvent;
  mouseout: MouseEvent;
  mousemove: MouseEvent;
  focus: FocusEvent;
  blur: FocusEvent;
  input: InputEvent;
  change: Event;
  keydown: KeyboardEvent;
  keyup: KeyboardEvent;
  keypress: KeyboardEvent;
  submit: Event;
  scroll: Event;
  wheel: WheelEvent;
  touchstart: TouchEvent;
  touchend: TouchEvent;
  touchmove: TouchEvent;
  touchcancel: TouchEvent;
}

const DELEGATED_EVENTS: (keyof DelegatedEventMap)[] = [
  'click',
  'dblclick',
  'mousedown',
  'mouseup',
  'mouseover',
  'mouseout',
  'mousemove',
  'focus',
  'blur',
  'input',
  'change',
  'keydown',
  'keyup',
  'keypress',
  'submit',
  'scroll',
  'wheel',
  'touchstart',
  'touchend',
  'touchmove',
  'touchcancel',
];

interface DelegatedHandler {
  handler: EventListener;
  original: EventListener;
  element: Element;
  container: Element;
  eventName: string;
  options?: AddEventListenerOptions;
}

type DelegatedHandlerStore = DelegatedHandler | Map<string, DelegatedHandler>;

const delegatedHandlers = new WeakMap<Element, DelegatedHandlerStore>();

let eventDelegationEnabled = true;
let defaultContainer: Element | null = null;
let globalDelegationContainer: Element | null = null;
const containerDelegatedListeners = new Map<
  Element,
  Map<string, EventListener>
>();
const containerDelegatedListenerUsage = new Map<Element, Map<string, number>>();

export function isEventDelegationEnabled(): boolean {
  return eventDelegationEnabled;
}

export function disableEventDelegation(): void {
  eventDelegationEnabled = false;
  cleanupAllDelegatedListeners();
}

export function enableEventDelegation(container?: Element): void {
  eventDelegationEnabled = true;
  if (container) {
    defaultContainer = container;
  }
}

export function setGlobalDelegationContainer(container: Element): void {
  globalDelegationContainer = container;
}

function cleanupAllDelegatedListeners(): void {
  for (const [container, listeners] of containerDelegatedListeners) {
    for (const [eventName, handler] of listeners) {
      container.removeEventListener(eventName, handler);
    }
  }
  containerDelegatedListeners.clear();
  containerDelegatedListenerUsage.clear();
}

function incrementContainerListenerUsage(
  container: Element,
  eventName: string
): void {
  let usage = containerDelegatedListenerUsage.get(container);
  if (!usage) {
    usage = new Map();
    containerDelegatedListenerUsage.set(container, usage);
  }
  usage.set(eventName, (usage.get(eventName) ?? 0) + 1);
}

function decrementContainerListenerUsage(entry: DelegatedHandler): void {
  const usage = containerDelegatedListenerUsage.get(entry.container);
  if (!usage) {
    return;
  }

  const nextCount = (usage.get(entry.eventName) ?? 0) - 1;
  if (nextCount > 0) {
    usage.set(entry.eventName, nextCount);
    return;
  }

  usage.delete(entry.eventName);
  const listeners = containerDelegatedListeners.get(entry.container);
  const listener = listeners?.get(entry.eventName);
  if (listener) {
    entry.container.removeEventListener(entry.eventName, listener);
    listeners?.delete(entry.eventName);
  }

  if (listeners?.size === 0) {
    containerDelegatedListeners.delete(entry.container);
  }
  if (usage.size === 0) {
    containerDelegatedListenerUsage.delete(entry.container);
  }
}

function getDelegationContainer(): Element | null {
  if (globalDelegationContainer) return globalDelegationContainer;
  if (defaultContainer) return defaultContainer;
  if (typeof document !== 'undefined') return document.body;
  return null;
}

function attachDelegatedListener(
  container: Element,
  element: Element,
  eventName: string,
  handler: EventListener,
  originalHandler: EventListener,
  options?: AddEventListenerOptions
): void {
  const hadHandler = !!getDelegatedHandlerForElement(element, eventName);

  if (!containerDelegatedListeners.has(container)) {
    containerDelegatedListeners.set(container, new Map());
  }
  const containerListeners = containerDelegatedListeners.get(container)!;

  if (!containerListeners.has(eventName)) {
    const delegatedHandler = (e: Event) => {
      const target = e.target as Element;
      if (!target) return;

      runRuntimeHandlerScope(() => {
        let current: Element | null = target;
        while (current && current !== container) {
          incrementPerfMetric('delegatedAncestorHops');
          const store = delegatedHandlers.get(current);
          const entry = !store
            ? undefined
            : store instanceof Map
              ? store.get(eventName)
              : store.eventName === eventName
                ? store
                : undefined;
          if (entry) {
            try {
              entry.handler(e);
            } catch (error) {
              logger.error('[Askr] Delegated event error:', error);
            }
          }

          if (e.cancelBubble) {
            break;
          }

          current = current.parentElement;
        }
      }, 'sync');
    };

    const passiveOptions = getPassiveOptions(eventName);
    const listenerOptions = passiveOptions ?? options;

    container.addEventListener(eventName, delegatedHandler, listenerOptions);
    containerListeners.set(eventName, delegatedHandler);
  }

  setDelegatedHandlerForElement(element, {
    handler,
    original: originalHandler,
    element,
    container,
    eventName,
    options,
  });
  if (!hadHandler) {
    incrementContainerListenerUsage(container, eventName);
  }
}

function setDelegatedHandlerForElement(
  element: Element,
  entry: DelegatedHandler
): void {
  const existing = delegatedHandlers.get(element);
  if (!existing) {
    delegatedHandlers.set(element, entry);
    return;
  }

  if (existing instanceof Map) {
    existing.set(entry.eventName, entry);
    return;
  }

  if (existing.eventName === entry.eventName) {
    delegatedHandlers.set(element, entry);
    return;
  }

  const next = new Map<string, DelegatedHandler>();
  next.set(existing.eventName, existing);
  next.set(entry.eventName, entry);
  delegatedHandlers.set(element, next);
}

function getPassiveOptions(
  eventName: string
): AddEventListenerOptions | undefined {
  if (
    eventName === 'wheel' ||
    eventName === 'scroll' ||
    eventName.startsWith('touch')
  ) {
    return { passive: true };
  }
  return undefined;
}

export function addDelegatedListener(
  element: Element,
  eventName: string,
  handler: EventListener,
  originalHandler: EventListener,
  options?: AddEventListenerOptions
): void {
  if (!eventDelegationEnabled) return;

  const container = getDelegationContainer();
  if (!container) return;

  incDevCounter('listenerAdds');

  attachDelegatedListener(
    container,
    element,
    eventName,
    handler,
    originalHandler,
    options
  );
}

export function updateDelegatedListener(
  element: Element,
  eventName: string,
  handler: EventListener,
  originalHandler: EventListener,
  options?: AddEventListenerOptions
): boolean {
  const existing = getDelegatedHandlerForElement(element, eventName);
  if (!existing) {
    return false;
  }

  const container = getDelegationContainer();
  if (
    !container ||
    existing.container !== container ||
    !containerDelegatedListeners.get(existing.container)?.has(eventName)
  ) {
    removeDelegatedListener(element, eventName);
    return false;
  }

  existing.handler = handler;
  existing.original = originalHandler;
  existing.options = options;
  return true;
}

export function removeDelegatedListener(
  element: Element,
  eventName: string
): void {
  const existing = delegatedHandlers.get(element);
  if (!existing) {
    return;
  }

  if (existing instanceof Map) {
    if (existing.has(eventName)) {
      incDevCounter('listenerRemoves');
      decrementContainerListenerUsage(existing.get(eventName)!);
    }
    existing.delete(eventName);
    if (existing.size === 0) {
      delegatedHandlers.delete(element);
      return;
    }
    if (existing.size === 1) {
      const only = existing.values().next().value as DelegatedHandler;
      delegatedHandlers.set(element, only);
    }
    return;
  }

  if (existing.eventName === eventName) {
    incDevCounter('listenerRemoves');
    decrementContainerListenerUsage(existing);
    delegatedHandlers.delete(element);
  }
}

export function getDelegatedHandlerForElement(
  element: Element,
  eventName: string
): DelegatedHandler | undefined {
  const store = delegatedHandlers.get(element);
  if (!store) return undefined;
  if (store instanceof Map) return store.get(eventName);
  return store.eventName === eventName ? store : undefined;
}

export function getDelegatedHandlersForElement(
  element: Element
): Map<string, DelegatedHandler> | undefined {
  const store = delegatedHandlers.get(element);
  if (!store) return undefined;
  if (store instanceof Map) return store;
  return new Map([[store.eventName, store]]);
}

export function hasDelegatedHandler(
  element: Element,
  eventName: string
): boolean {
  return getDelegatedHandlerForElement(element, eventName) !== undefined;
}

export function clearDelegatedHandlersForElement(element: Element): void {
  const existing = delegatedHandlers.get(element);
  if (existing instanceof Map) {
    for (const entry of existing.values()) {
      decrementContainerListenerUsage(entry);
    }
  } else if (existing) {
    decrementContainerListenerUsage(existing);
  }
  delegatedHandlers.delete(element);
}

export function getDelegatedEventNames(): readonly (keyof DelegatedEventMap)[] {
  return DELEGATED_EVENTS;
}

export function isDelegatedEvent(eventName: string): boolean {
  return DELEGATED_EVENTS.includes(eventName as keyof DelegatedEventMap);
}
