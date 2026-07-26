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
import { logger } from '../common/logger';
import { incrementPerfMetric } from './perf-metrics';
import { incDevCounter } from './dev-namespace';

declare const __ASKR_BENCH_BUILD__: boolean;
declare const __ASKR_DEVELOPMENT_BUILD__: boolean;

const DEVELOPMENT_BUILD_ENABLED = __ASKR_DEVELOPMENT_BUILD__;
const PERF_BUILD_ENABLED = DEVELOPMENT_BUILD_ENABLED || __ASKR_BENCH_BUILD__;

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
  container: Element;
  eventName: string;
  options?: AddEventListenerOptions;
}

type DelegatedHandlerStore = DelegatedHandler | Map<string, DelegatedHandler>;

const DELEGATED_HANDLERS = Symbol('askr.delegated-handlers');
type DelegatedHandlerElement = Element & {
  [DELEGATED_HANDLERS]?: DelegatedHandlerStore;
};

const delegatedHandlerFallback = new WeakMap<Element, DelegatedHandlerStore>();

function getDelegatedHandlerStore(
  element: Element
): DelegatedHandlerStore | undefined {
  return (
    (element as DelegatedHandlerElement)[DELEGATED_HANDLERS] ??
    delegatedHandlerFallback.get(element)
  );
}

function isElementNode(node: EventTarget | null): node is Element {
  if (!node || typeof node !== 'object') {
    return false;
  }
  if (typeof Element !== 'undefined') {
    return node instanceof Element;
  }
  return (node as Node).nodeType === 1;
}

function setDelegatedHandlerStore(
  element: Element,
  store: DelegatedHandlerStore
): void {
  const host = element as DelegatedHandlerElement;
  try {
    host[DELEGATED_HANDLERS] = store;
    if (host[DELEGATED_HANDLERS] === store) {
      return;
    }
  } catch {
    // Exotic or non-extensible element wrappers retain the WeakMap fallback.
  }
  delegatedHandlerFallback.set(element, store);
}

function deleteDelegatedHandlerStore(element: Element): void {
  const host = element as DelegatedHandlerElement;
  if (host[DELEGATED_HANDLERS] !== undefined) {
    try {
      delete host[DELEGATED_HANDLERS];
      return;
    } catch {
      // Exotic or non-extensible element wrappers retain the WeakMap fallback.
    }
  }
  delegatedHandlerFallback.delete(element);
}

interface ContainerDelegatedListener {
  handler: EventListener;
  usage: number;
}

let eventDelegationEnabled = true;
let defaultContainer: Element | null = null;
let globalDelegationContainer: Element | null = null;
const containerDelegatedListeners = new Map<
  Element,
  Map<string, ContainerDelegatedListener>
>();

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
    for (const [eventName, entry] of listeners) {
      container.removeEventListener(eventName, entry.handler);
    }
  }
  containerDelegatedListeners.clear();
}

function decrementContainerListenerUsage(entry: DelegatedHandler): void {
  const listeners = containerDelegatedListeners.get(entry.container);
  const listener = listeners?.get(entry.eventName);
  if (!listener) {
    return;
  }

  listener.usage -= 1;
  if (listener.usage > 0) {
    return;
  }

  entry.container.removeEventListener(entry.eventName, listener.handler);
  listeners?.delete(entry.eventName);

  if (listeners?.size === 0) {
    containerDelegatedListeners.delete(entry.container);
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
  options?: AddEventListenerOptions,
  fresh = false
): void {
  const existingStore = fresh ? undefined : getDelegatedHandlerStore(element);
  const hadHandler =
    existingStore instanceof Map
      ? existingStore.has(eventName)
      : existingStore?.eventName === eventName;

  let containerListeners = containerDelegatedListeners.get(container);
  if (!containerListeners) {
    containerListeners = new Map();
    containerDelegatedListeners.set(container, containerListeners);
  }

  let containerListener = containerListeners.get(eventName);
  if (!containerListener) {
    const delegatedHandler = (e: Event) => {
      runRuntimeHandlerScope(() => {
        const path: EventTarget[] = [];
        // Some browser hosts expose a composedPath that omits ordinary DOM
        // ancestors (notably across document/container boundaries). Always
        // supplement it with the native target ancestry so delegated
        // handlers remain reliable after navigation and hydration.
        let node = e.target;
        while (node) {
          if (!path.includes(node)) {
            path.push(node);
          }
          if (node === container) {
            break;
          }
          node = isElementNode(node)
            ? node.parentNode
            : (node as Node).parentNode;
        }
        if (typeof e.composedPath === 'function') {
          for (const composedNode of e.composedPath()) {
            if (!path.includes(composedNode)) {
              path.push(composedNode);
            }
          }
        }
        for (const node of path) {
          if (node === container) break;
          if (!isElementNode(node)) continue;
          if (PERF_BUILD_ENABLED) {
            incrementPerfMetric('delegatedAncestorHops');
          }
          const store = getDelegatedHandlerStore(node);
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
        }
      }, 'sync');
    };

    const passiveOptions = getPassiveOptions(eventName);
    const listenerOptions = passiveOptions ?? options;

    container.addEventListener(eventName, delegatedHandler, listenerOptions);
    containerListener = { handler: delegatedHandler, usage: 0 };
    containerListeners.set(eventName, containerListener);
  }

  setDelegatedHandlerForElement(
    element,
    {
      handler,
      original: originalHandler,
      container,
      eventName,
      options,
    },
    existingStore
  );
  if (!hadHandler) {
    containerListener.usage += 1;
  }
}

function setDelegatedHandlerForElement(
  element: Element,
  entry: DelegatedHandler,
  existing = getDelegatedHandlerStore(element)
): void {
  if (!existing) {
    setDelegatedHandlerStore(element, entry);
    return;
  }

  if (existing instanceof Map) {
    existing.set(entry.eventName, entry);
    return;
  }

  if (existing.eventName === entry.eventName) {
    setDelegatedHandlerStore(element, entry);
    return;
  }

  const next = new Map<string, DelegatedHandler>();
  next.set(existing.eventName, existing);
  next.set(entry.eventName, entry);
  setDelegatedHandlerStore(element, next);
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

  if (DEVELOPMENT_BUILD_ENABLED) {
    incDevCounter('listenerAdds');
  }

  attachDelegatedListener(
    container,
    element,
    eventName,
    handler,
    originalHandler,
    options
  );
}

/** @internal Attach a delegated handler to a newly cloned element. */
export function addFreshDelegatedListener(
  element: Element,
  eventName: string,
  handler: EventListener,
  originalHandler: EventListener,
  options?: AddEventListenerOptions
): void {
  if (!eventDelegationEnabled) return;

  const container = getDelegationContainer();
  if (!container) return;

  if (DEVELOPMENT_BUILD_ENABLED) {
    incDevCounter('listenerAdds');
  }

  attachDelegatedListener(
    container,
    element,
    eventName,
    handler,
    originalHandler,
    options,
    true
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
  const existing = getDelegatedHandlerStore(element);
  if (!existing) {
    return;
  }

  if (existing instanceof Map) {
    if (existing.has(eventName)) {
      if (DEVELOPMENT_BUILD_ENABLED) {
        incDevCounter('listenerRemoves');
      }
      decrementContainerListenerUsage(existing.get(eventName)!);
    }
    existing.delete(eventName);
    if (existing.size === 0) {
      deleteDelegatedHandlerStore(element);
      return;
    }
    if (existing.size === 1) {
      const only = existing.values().next().value as DelegatedHandler;
      setDelegatedHandlerStore(element, only);
    }
    return;
  }

  if (existing.eventName === eventName) {
    if (DEVELOPMENT_BUILD_ENABLED) {
      incDevCounter('listenerRemoves');
    }
    decrementContainerListenerUsage(existing);
    deleteDelegatedHandlerStore(element);
  }
}

export function getDelegatedHandlerForElement(
  element: Element,
  eventName: string
): DelegatedHandler | undefined {
  const store = getDelegatedHandlerStore(element);
  if (!store) return undefined;
  if (store instanceof Map) return store.get(eventName);
  return store.eventName === eventName ? store : undefined;
}

export function getDelegatedHandlersForElement(
  element: Element
): Map<string, DelegatedHandler> | undefined {
  const store = getDelegatedHandlerStore(element);
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
  const existing = getDelegatedHandlerStore(element);
  if (existing instanceof Map) {
    for (const entry of existing.values()) {
      decrementContainerListenerUsage(entry);
    }
  } else if (existing) {
    decrementContainerListenerUsage(existing);
  }
  deleteDelegatedHandlerStore(element);
}

export function getDelegatedEventNames(): readonly (keyof DelegatedEventMap)[] {
  return DELEGATED_EVENTS;
}

export function isDelegatedEvent(eventName: string): boolean {
  return DELEGATED_EVENTS.includes(eventName as keyof DelegatedEventMap);
}
