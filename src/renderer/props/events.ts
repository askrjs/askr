/**
 * Event delegation system for Askr
 *
 * Provides efficient event handling by attaching listeners to each app root
 * container instead of individual elements. This significantly reduces memory
 * usage and improves performance when many elements have the same event type.
 *
 * Only events that bubble, are composed and have no passive-listener
 * intervention are delegated. Non-bubbling events (`focus`, `blur`,
 * `scroll`, ...), non-composed events (`change`, `submit`), which never
 * leave a shadow root, and the events browsers treat as passive on
 * document-level targets (`wheel`, `touchstart`, `touchmove`) attach
 * directly to their element, so they keep native targeting, shadow DOM and
 * `preventDefault()` semantics.
 *
 * Delegated handling is enabled by default. Tests and internal runtime code
 * can still disable or re-enable it when they need to exercise both modes.
 */

import { runRuntimeHandlerScope } from '../../runtime';
import {
  getCurrentAppRenderRuntime,
  getCurrentLifecycleInstance,
  withAppRenderRuntime,
  withLifecycleOwner,
  type ComponentInstance,
} from '../../runtime';
import type { AppRenderRuntime } from '../../common/app-render-runtime';
import { reportUncaughtError } from '../../common/report-error';
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
  keydown: KeyboardEvent;
  keyup: KeyboardEvent;
  keypress: KeyboardEvent;
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
  'keydown',
  'keyup',
  'keypress',
  'touchend',
  'touchcancel',
];

interface DelegatedHandler {
  handler: EventListener;
  original: EventListener;
  appRuntime?: AppRenderRuntime;
  instance: ComponentInstance | null;
  eventName: string;
  options?: AddEventListenerOptions;
}

function createDelegatedEventFacade(
  event: Event,
  currentTarget: Element,
  eventTarget: EventTarget | null
): Event {
  return new Proxy(event, {
    get(target, property, _receiver) {
      if (property === 'currentTarget') {
        return currentTarget;
      }
      if (property === 'target') {
        return eventTarget;
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

/** Number of elements holding a delegated handler, per event type. */
const delegatedEventUsage = new Map<string, number>();

/**
 * A container with delegated listeners: a registered app root, or the
 * fallback container for content rendered outside any root. Records only
 * hold their element weakly, and listeners resolve the container from
 * `currentTarget`, so an app root removed from the DOM without `cleanupApp`
 * is not pinned by the delegation registry.
 */
interface DelegationContainer {
  ref: WeakRef<Element>;
  listeners: Map<string, EventListener>;
  /** App roots listen for every delegated event type in use. */
  root: boolean;
}

const delegationContainers = new WeakMap<Element, DelegationContainer>();
const liveDelegationContainers = new Set<DelegationContainer>();

function forEachDelegationContainer(
  visit: (container: Element, record: DelegationContainer) => void
): void {
  for (const record of liveDelegationContainers) {
    const container = record.ref.deref();
    if (container) {
      visit(container, record);
    } else {
      liveDelegationContainers.delete(record);
    }
  }
}

function getOrCreateDelegationContainer(
  container: Element
): DelegationContainer {
  let record = delegationContainers.get(container);
  if (!record) {
    record = { ref: new WeakRef(container), listeners: new Map(), root: false };
    delegationContainers.set(container, record);
    liveDelegationContainers.add(record);
  }
  return record;
}

function releaseDelegationContainer(
  container: Element,
  record: DelegationContainer
): void {
  if (record.root || record.listeners.size > 0) return;
  delegationContainers.delete(container);
  liveDelegationContainers.delete(record);
}

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

/**
 * @internal Delegate events rendered under `root` at `root` itself, so apps
 * mounted in shadow roots, iframes, or nested inside another app receive
 * their own events.
 */
export function registerDelegationRoot(root: Element): void {
  const record = getOrCreateDelegationContainer(root);
  if (record.root) return;
  record.root = true;
  if (!eventDelegationEnabled) return;
  for (const eventName of delegatedEventUsage.keys()) {
    installContainerListener(root, eventName);
  }
}

/** @internal Stop delegating at `root` once its app is torn down. */
export function unregisterDelegationRoot(root: Element): void {
  const record = delegationContainers.get(root);
  if (!record?.root) return;
  record.root = false;
  if (root === getDelegationContainer()) return;
  for (const [eventName, handler] of record.listeners) {
    root.removeEventListener(eventName, handler);
  }
  record.listeners.clear();
  releaseDelegationContainer(root, record);
}

function cleanupAllDelegatedListeners(): void {
  forEachDelegationContainer((container, record) => {
    for (const [eventName, handler] of record.listeners) {
      container.removeEventListener(eventName, handler);
    }
    record.listeners.clear();
    releaseDelegationContainer(container, record);
  });
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
  const record = getOrCreateDelegationContainer(container);
  if (record.listeners.has(eventName)) return;
  const handler = createContainerListener(eventName);
  try {
    container.addEventListener(eventName, handler);
  } catch (error) {
    releaseDelegationContainer(container, record);
    throw error;
  }
  record.listeners.set(eventName, handler);
}

function removeContainerListeners(eventName: string): void {
  forEachDelegationContainer((container, record) => {
    const handler = record.listeners.get(eventName);
    if (!handler) return;
    container.removeEventListener(eventName, handler);
    record.listeners.delete(eventName);
    releaseDelegationContainer(container, record);
  });
}

/** Listen at every app root and the fallback container for `eventName`. */
function installDelegatedEvent(eventName: string): void {
  try {
    forEachDelegationContainer((container, record) => {
      if (record.root) installContainerListener(container, eventName);
    });
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
  return delegationContainers.get(node)?.listeners.has(eventName) ?? false;
}

function isShadowRoot(node: Node): node is ShadowRoot {
  return node.nodeType === 11 && (node as ShadowRoot).host != null;
}

/**
 * Index of `container` in `composed`, or -1 when the composed path cannot be
 * used: it lacks the container, or it skips an ancestor of the (retargeted)
 * target below the container, as some browser hosts do.
 */
function getComposedPathEnd(
  composed: readonly EventTarget[],
  target: EventTarget | null,
  container: Element
): number {
  const end = composed.indexOf(container);
  if (end === -1) return -1;
  let expected = target as Node | null;
  for (let i = 0; i < end && expected; i++) {
    if (composed[i] === expected) expected = expected.parentNode;
  }
  return expected === container ? end : -1;
}

/**
 * The target's parent chain up to `container`, supplemented with any
 * composed path nodes it misses, for hosts whose composed path is unusable.
 */
function getAncestryPath(event: Event, container: Element): EventTarget[] {
  const path: EventTarget[] = [];
  const seen = new Set<EventTarget>();
  for (let node = event.target as Node | null; node; node = node.parentNode) {
    seen.add(node);
    path.push(node);
    if (node === container) return path;
  }
  if (typeof event.composedPath === 'function') {
    for (const node of event.composedPath()) {
      if (!seen.has(node)) {
        seen.add(node);
        path.push(node);
      }
    }
  }
  return path;
}

function createContainerListener(eventName: string): EventListener {
  return (e: Event) => {
    // Resolve the container per event instead of capturing it, so the
    // registry's listener map never holds the container strongly.
    const container = e.currentTarget as Element;
    runRuntimeHandlerScope(() => {
      // composedPath() reaches into open shadow roots attached below the
      // container, which the target (retargeted to the shadow host here)
      // and its parent chain do not.
      const composed =
        typeof e.composedPath === 'function' ? e.composedPath() : [];
      const composedEnd = getComposedPathEnd(composed, e.target, container);
      const path =
        composedEnd === -1 ? getAncestryPath(e, container) : composed;
      const end = composedEnd === -1 ? path.length : composedEnd;
      // Handlers inside a shadow tree see the real target, not the host.
      // Retarget from the path's shape, which dispatch fixed up front,
      // rather than the live DOM: a listener may detach nodes meanwhile.
      // `depth` is the shadow depth of the current node relative to the
      // target; leaving a shadow root above the target's tree retargets
      // to its host, and entering a slot from an assigned node goes deeper.
      const retarget = composedEnd > 0 && composed[0] !== e.target;
      let target: EventTarget | null = retarget ? composed[0] : e.target;
      let depth = 0;
      let targetDepth = 0;
      const dispatchPath: Array<{
        node: Element;
        entry: DelegatedHandler;
        target: EventTarget | null;
      }> = [];
      for (let i = 0; i < end; i++) {
        const node = path[i];
        if (node === container) break;
        if (retarget) {
          if (isShadowRoot(node as Node)) {
            if (--depth < targetDepth) {
              target = (node as ShadowRoot).host;
              targetDepth = depth;
            }
          } else if (
            (node as Node).nodeName === 'SLOT' &&
            (path[i - 1] as Node).parentNode !== node
          ) {
            depth++;
          }
        }
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
          dispatchPath.push({ node, entry, target });
        }
      }

      // Delegated events all bubble, so handlers run target-first, matching
      // native bubbling order.
      for (const { node, entry, target } of dispatchPath) {
        try {
          withAppRenderRuntime(entry.appRuntime, () =>
            withLifecycleOwner(entry.instance?.owner, () =>
              entry.handler(createDelegatedEventFacade(e, node, target))
            )
          );
        } catch (error) {
          // Like native listeners: report, then keep dispatching.
          reportUncaughtError(error);
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
      instance: getCurrentLifecycleInstance(),
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
  existing.instance = getCurrentLifecycleInstance();
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
