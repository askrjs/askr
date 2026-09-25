/**
 * Event delegation system for Askr
 *
 * Provides efficient event handling by attaching listeners to each app root
 * container instead of individual elements. This significantly reduces memory
 * usage and improves performance when many elements have the same event type.
 *
 * Only events that bubble and have no passive-listener intervention are
 * delegated. Non-bubbling events (`focus`, `blur`, `scroll`, ...) and the
 * events browsers treat as passive on document-level targets (`wheel`,
 * `touchstart`, `touchmove`) attach directly to their element, so they keep
 * native targeting and `preventDefault()` semantics.
 *
 * Delegated handling is enabled by default. Tests and internal runtime code
 * can still disable or re-enable it when they need to exercise both modes.
 */

import { runRuntimeHandlerScope } from '../../runtime';
import {
  getCurrentAppRenderRuntime,
  withAppRenderRuntime,
} from '../../runtime';
import type { AppRenderRuntime } from '../../common/app-render-runtime';
import { logger } from '../../common/logger';
import { incrementPerfMetric } from '../../runtime';
import { incDevCounter } from '../../runtime';

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
  input: InputEvent;
  change: Event;
  keydown: KeyboardEvent;
  keyup: KeyboardEvent;
  keypress: KeyboardEvent;
  submit: Event;
  touchend: TouchEvent;
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
  'input',
  'change',
  'keydown',
  'keyup',
  'keypress',
  'submit',
  'touchend',
  'touchcancel',
];

interface DelegatedHandler {
  handler: EventListener;
  original: EventListener;
  appRuntime?: AppRenderRuntime;
  eventName: string;
  options?: AddEventListenerOptions;
}

function createDelegatedEventFacade(
  event: Event,
  currentTarget: Element
): Event {
  return new Proxy(event, {
    get(target, property, _receiver) {
      if (property === 'currentTarget') {
        return currentTarget;
      }

      // Native event accessors require the original event as their receiver;
      // using the proxy here triggers Illegal invocation in browser engines.
      const value = Reflect.get(target, property, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
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

let eventDelegationEnabled = true;
let defaultContainer: Element | null = null;
let globalDelegationContainer: Element | null = null;

/**
 * App roots registered by the boot layer. Each root listens for every
 * delegated event type in use, so apps mounted in shadow roots, iframes, or
 * nested inside another app receive their own events.
 */
const delegationRoots = new Set<Element>();

/** Number of elements holding a delegated handler, per event type. */
const delegatedEventUsage = new Map<string, number>();

/** Installed container listeners (app roots and the fallback container). */
const containerDelegatedListeners = new Map<
  Element,
  Map<string, EventListener>
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
    installFallbackContainerListeners();
  }
}

export function setGlobalDelegationContainer(container: Element): void {
  globalDelegationContainer = container;
  installFallbackContainerListeners();
}

/** @internal Delegate events rendered under `root` at `root` itself. */
export function registerDelegationRoot(root: Element): void {
  if (delegationRoots.has(root)) return;
  delegationRoots.add(root);
  if (!eventDelegationEnabled) return;
  for (const eventName of delegatedEventUsage.keys()) {
    installContainerListener(root, eventName);
  }
}

/** @internal Stop delegating at `root` once its app is torn down. */
export function unregisterDelegationRoot(root: Element): void {
  if (!delegationRoots.delete(root) || root === getDelegationContainer()) {
    return;
  }
  const listeners = containerDelegatedListeners.get(root);
  if (!listeners) return;
  containerDelegatedListeners.delete(root);
  for (const [eventName, handler] of listeners) {
    root.removeEventListener(eventName, handler);
  }
}

function cleanupAllDelegatedListeners(): void {
  for (const [container, listeners] of containerDelegatedListeners) {
    for (const [eventName, handler] of listeners) {
      container.removeEventListener(eventName, handler);
    }
  }
  containerDelegatedListeners.clear();
  delegatedEventUsage.clear();
}

function installFallbackContainerListeners(): void {
  if (!eventDelegationEnabled) return;
  const container = getDelegationContainer();
  if (!container) return;
  for (const eventName of delegatedEventUsage.keys()) {
    installContainerListener(container, eventName);
  }
}

function installContainerListener(container: Element, eventName: string): void {
  let listeners = containerDelegatedListeners.get(container);
  if (listeners?.has(eventName)) return;
  const handler = createContainerListener(container, eventName);
  container.addEventListener(eventName, handler);
  if (!listeners) {
    listeners = new Map();
    containerDelegatedListeners.set(container, listeners);
  }
  listeners.set(eventName, handler);
}

function removeContainerListeners(eventName: string): void {
  for (const [container, listeners] of containerDelegatedListeners) {
    const handler = listeners.get(eventName);
    if (!handler) continue;
    container.removeEventListener(eventName, handler);
    listeners.delete(eventName);
    if (listeners.size === 0) {
      containerDelegatedListeners.delete(container);
    }
  }
}

/** Listen at every app root and the fallback container for `eventName`. */
function installDelegatedEvent(eventName: string): void {
  try {
    for (const root of delegationRoots) {
      installContainerListener(root, eventName);
    }
    const fallback = getDelegationContainer();
    if (fallback) {
      installContainerListener(fallback, eventName);
    }
  } catch (error) {
    removeContainerListeners(eventName);
    throw error;
  }
}

function decrementContainerListenerUsage(entry: DelegatedHandler): void {
  const usage = delegatedEventUsage.get(entry.eventName);
  if (usage === undefined) {
    return;
  }

  if (usage > 1) {
    delegatedEventUsage.set(entry.eventName, usage - 1);
    return;
  }

  delegatedEventUsage.delete(entry.eventName);
  removeContainerListeners(entry.eventName);
}

function getDelegationContainer(): Element | null {
  if (globalDelegationContainer) return globalDelegationContainer;
  if (defaultContainer) return defaultContainer;
  if (typeof document !== 'undefined') return document.body;
  return null;
}

function isListeningContainer(node: Element, eventName: string): boolean {
  return containerDelegatedListeners.get(node)?.has(eventName) ?? false;
}

function createContainerListener(
  container: Element,
  eventName: string
): EventListener {
  return (e: Event) => {
    runRuntimeHandlerScope(() => {
      const path: EventTarget[] = [];
      // Some browser hosts expose a composedPath that omits ordinary DOM
      // ancestors (notably across document/container boundaries). Always
      // supplement it with the native target ancestry so delegated
      // handlers remain reliable after navigation and hydration.
      const seenPathNodes = new Set<EventTarget>();
      let node = e.target;
      while (node) {
        if (!seenPathNodes.has(node)) {
          seenPathNodes.add(node);
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
          if (!seenPathNodes.has(composedNode)) {
            seenPathNodes.add(composedNode);
            path.push(composedNode);
          }
        }
      }
      const dispatchPath: Array<{
        node: Element;
        entry: DelegatedHandler;
      }> = [];
      for (const node of path) {
        if (node === container) break;
        if (!isElementNode(node)) continue;
        if (PERF_BUILD_ENABLED) {
          incrementPerfMetric('delegatedAncestorHops');
        }
        // A nested container (an app mounted inside this one) already
        // dispatched the handlers below it while the event bubbled through.
        if (isListeningContainer(node, eventName)) {
          dispatchPath.length = 0;
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
          dispatchPath.push({ node, entry });
        }
      }

      // Delegated events all bubble, so handlers run target-first, matching
      // native bubbling order.
      for (const { node, entry } of dispatchPath) {
        try {
          withAppRenderRuntime(entry.appRuntime, () =>
            entry.handler(createDelegatedEventFacade(e, node))
          );
        } catch (error) {
          logger.error('[Askr] Delegated event error:', error);
        }

        if (e.cancelBubble) {
          break;
        }
      }
    }, 'sync');
  };
}

function attachDelegatedListener(
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

  const usage = delegatedEventUsage.get(eventName);
  if (usage === undefined) {
    installDelegatedEvent(eventName);
  }

  setDelegatedHandlerForElement(
    element,
    {
      handler,
      original: originalHandler,
      appRuntime: getCurrentAppRenderRuntime(),
      eventName,
      options,
    },
    existingStore
  );
  delegatedEventUsage.set(eventName, (usage ?? 0) + (hadHandler ? 0 : 1));
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

export function addDelegatedListener(
  element: Element,
  eventName: string,
  handler: EventListener,
  originalHandler: EventListener,
  options?: AddEventListenerOptions
): void {
  if (!eventDelegationEnabled || !getDelegationContainer()) return;

  if (DEVELOPMENT_BUILD_ENABLED) {
    incDevCounter('listenerAdds');
  }

  attachDelegatedListener(
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
  if (!eventDelegationEnabled || !getDelegationContainer()) return;

  if (DEVELOPMENT_BUILD_ENABLED) {
    incDevCounter('listenerAdds');
  }

  attachDelegatedListener(
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

  if (!eventDelegationEnabled || !delegatedEventUsage.has(eventName)) {
    removeDelegatedListener(element, eventName);
    return false;
  }

  existing.handler = handler;
  existing.original = originalHandler;
  existing.appRuntime = getCurrentAppRenderRuntime();
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
