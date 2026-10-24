/**
 * Event handler props on rendered elements.
 *
 * Bubbling UI events (`click`, `input`, keyboard, mouse, touch) are
 * delegated: each app root, plus `document.body` for content rendered outside
 * any root (portals), listens once per event type. When an event reaches a
 * container, its handlers along the event path are snapshotted and run
 * target-first in one batch, so state writes flush once, synchronously, after
 * the last handler, and a handler that removes an ancestor does not stop that
 * ancestor's handler for the same event. Other events and capture handlers
 * get one direct listener per element, run in their own batch.
 *
 * A handler's handler function can be swapped without re-registering. It runs
 * with its component as the current owner, and a throwing handler is reported
 * like an uncaught listener exception.
 */

import { warnUnknownEventProp } from '../../common/dev-warnings';
import { reportUncaughtError } from '../../common/report-error';
import { runWithOwner, type Owner } from '../reactive/owner';
import { batch } from '../reactive/scheduler';
import { outsideRendering } from '../component/render-state';

declare const __ASKR_DEVELOPMENT_BUILD__: boolean;

export interface ParsedEvent {
  readonly eventName: string;
  readonly capture: boolean;
  /** `onWheelPassive`: a passive listener, which cannot call preventDefault(). */
  readonly passive?: boolean;
  /** `onClickOnce`: the handler runs for the first event only. */
  readonly once?: boolean;
}

export interface Listener {
  handler: EventListener;
  readonly owner: Owner | null;
  readonly eventName: string;
  /** Null for a delegated handler, which has no native listener of its own. */
  readonly wrapped: EventListener | null;
  /** Delegated handler that runs this one for events from descendants. */
  companion?: Listener;
  readonly options: AddEventListenerOptions | undefined;
}

export type ListenerMap = Map<string, Listener>;

/** Root container visible to listeners through their component owner. */
export const EVENT_ROOT_CONTAINER = Symbol('askr.event-root-container');

const DELEGATED_EVENTS = new Set([
  'click',
  'dblclick',
  'mousedown',
  'mouseup',
  'mouseover',
  'mouseout',
  'mousemove',
  'pointerdown',
  'pointerup',
  'pointermove',
  'pointercancel',
  'pointerover',
  'pointerout',
  'touchend',
  'touchcancel',
  'keydown',
  'keyup',
  'keypress',
  'input',
  'focusin',
  'focusout',
]);

/**
 * `focus` and `blur` do not bubble, but their bubbling counterparts do. An
 * element's `onFocus`/`onBlur` runs for its own `focus`/`blur` through a direct
 * listener (which also sees the blur a removal emits) and, as in React, for
 * its descendants' through a delegated `focusin`/`focusout` handler.
 */
const DESCENDANT_EVENT: Record<string, string> = {
  focus: 'focusin',
  blur: 'focusout',
};

/**
 * `onClick` -> click, `onKeyDownCapture` -> keydown (capture),
 * `onWheelPassive` -> wheel (passive), `onClickOnce` -> click (once). The
 * `Capture`, `Passive` and `Once` suffixes combine in any order; else null.
 */
export function parseEventProp(propName: string): ParsedEvent | null {
  if (propName.length <= 2 || !propName.startsWith('on')) return null;
  let name = propName;
  let capture = false;
  let passive = false;
  let once = false;
  for (;;) {
    if (
      !capture &&
      name.endsWith('Capture') &&
      !name.endsWith('PointerCapture') &&
      name.length > 'onCapture'.length
    ) {
      capture = true;
      name = name.slice(0, -'Capture'.length);
    } else if (
      !passive &&
      name.endsWith('Passive') &&
      name.length > 'onPassive'.length
    ) {
      passive = true;
      name = name.slice(0, -'Passive'.length);
    } else if (
      !once &&
      name.endsWith('Once') &&
      name.length > 'onOnce'.length
    ) {
      once = true;
      name = name.slice(0, -'Once'.length);
    } else {
      break;
    }
  }
  if (name.length <= 2) return null;
  const eventName = name.slice(2).toLowerCase();
  // `onDoubleClick` is the common spelling; the DOM event is `dblclick`.
  return {
    eventName: eventName === 'doubleclick' ? 'dblclick' : eventName,
    capture,
    ...(passive ? { passive } : null),
    ...(once ? { once } : null),
  };
}

/**
 * `wheel`, `touchstart` and `touchmove` opt out of passive defaults so a
 * handler can call `preventDefault()`; `scroll` is always passive.
 */
function listenerOptions(
  event: ParsedEvent
): AddEventListenerOptions | undefined {
  const { eventName, capture, passive, once } = event;
  let options: AddEventListenerOptions | undefined;
  if (eventName === 'scroll') options = { passive: true };
  else if (
    eventName === 'wheel' ||
    eventName === 'touchstart' ||
    eventName === 'touchmove'
  ) {
    options = { passive: false };
  }
  if (passive) options = { ...options, passive: true };
  if (once) options = { ...options, once: true };
  if (!capture) return options;
  return { ...options, capture: true };
}

function invoke(listener: Listener, el: Element, event: Event): void {
  runWithOwner(listener.owner, () => {
    try {
      listener.handler.call(el, event);
    } catch (error) {
      reportUncaughtError(error);
    }
  });
}

// ---------------------------------------------------------------------------
// Delegation

/** Delegated handlers per element, by event type (several props can share one). */
const delegatedHandlers = new WeakMap<Element, Map<string, Set<Listener>>>();
/** The last root that dispatched an event, so body skips that dispatch only. */
const handledByRoot = new WeakMap<Event, Element>();
/** Elements holding a delegated handler, per event type. */
const delegatedUsage = new Map<string, number>();
/** Registered app roots, each counted once per live root using it. */
const roots = new Map<Element, number>();
/** Container listeners, per container, by event type. */
const containerListeners = new Map<Element, Map<string, EventListener>>();

function fallbackContainer(): Element | null {
  return typeof document === 'undefined' ? null : document.body;
}

function listen(container: Element, eventName: string): void {
  let listeners = containerListeners.get(container);
  if (listeners?.has(eventName)) return;
  const listener: EventListener = (event) => dispatch(event, eventName);
  container.addEventListener(eventName, listener);
  if (!listeners) containerListeners.set(container, (listeners = new Map()));
  listeners.set(eventName, listener);
}

function unlisten(container: Element, eventName: string): void {
  const listeners = containerListeners.get(container);
  const listener = listeners?.get(eventName);
  if (!listener) return;
  container.removeEventListener(eventName, listener);
  listeners!.delete(eventName);
  if (listeners!.size === 0) containerListeners.delete(container);
}

function containers(): Element[] {
  const all = [...roots.keys()];
  const fallback = fallbackContainer();
  if (fallback && !roots.has(fallback)) all.push(fallback);
  return all;
}

/** Delegate events rendered under `root` at `root`, until released. */
export function registerEventRoot(root: Element): () => void {
  roots.set(root, (roots.get(root) ?? 0) + 1);
  for (const eventName of delegatedUsage.keys()) listen(root, eventName);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    const count = roots.get(root)! - 1;
    if (count > 0) {
      roots.set(root, count);
      return;
    }
    roots.delete(root);
    if (root === fallbackContainer()) return;
    for (const eventName of delegatedUsage.keys()) unlisten(root, eventName);
  };
}

function isShadowRoot(node: EventTarget): node is ShadowRoot {
  return (node as Node).nodeType === 11 && (node as ShadowRoot).host != null;
}

/**
 * Index of `container` in `composed`, or -1 when the composed path cannot be
 * used: it lacks the container, or it skips an ancestor of the (retargeted)
 * target below the container, as some browser hosts do.
 */
function composedPathEnd(
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
function ancestryPath(event: Event, container: Element): EventTarget[] {
  const path: EventTarget[] = [];
  const seen = new Set<EventTarget>();
  for (let node = event.target as Node | null; node; node = node.parentNode) {
    seen.add(node);
    path.push(node);
    if (node === container) return path;
  }
  for (const node of event.composedPath?.() ?? []) {
    if (!seen.has(node)) {
      seen.add(node);
      path.push(node);
    }
  }
  return path;
}

/**
 * Handlers receive the native event itself, so every handler sees one object
 * and it can be dispatched again afterwards. While handlers run, `currentTarget`
 * (and `target`, when retargeted) are shadowed by own accessors on the event;
 * they are deleted when dispatch ends, which restores the native values.
 */
interface EventView {
  current: Element | null;
  target: EventTarget | null;
}

function viewEvent(event: Event): EventView {
  const view: EventView = { current: null, target: event.target };
  Object.defineProperty(event, 'currentTarget', {
    configurable: true,
    get: () => view.current,
  });
  Object.defineProperty(event, 'target', {
    configurable: true,
    get: () => view.target,
  });
  if (!('nativeEvent' in event)) {
    Object.defineProperty(event, 'nativeEvent', {
      configurable: true,
      value: event,
    });
  }
  return view;
}

function releaseEvent(event: Event): void {
  Reflect.deleteProperty(event, 'currentTarget');
  Reflect.deleteProperty(event, 'target');
}

function dispatch(event: Event, eventName: string): void {
  const container = event.currentTarget as Element;
  const isRoot = roots.has(container);
  const previousRoot = handledByRoot.get(event);
  const handledRoot = previousRoot === container ? undefined : previousRoot;
  // An app root already ran every handler below it; `document.body` only
  // listens for content rendered outside any root. An event can be dispatched
  // again outside that root, so the old marker alone cannot suppress it.
  if (!isRoot && handledRoot?.contains(event.target as Node | null)) return;
  if (isRoot) handledByRoot.set(event, container);
  // composedPath() reaches into open shadow roots below the container, which
  // the target (retargeted to the shadow host here) and its parents do not.
  const composed = event.composedPath?.() ?? [];
  // The target may have been detached, or retargeted at a shadow boundary,
  // since the root handled it; the native path still records this dispatch.
  if (!isRoot && handledRoot && composed.includes(handledRoot)) return;
  const end = composedPathEnd(composed, event.target, container);
  const path = end === -1 ? ancestryPath(event, container) : composed;
  const last = end === -1 ? path.length : end;
  // Handlers inside a shadow tree see the real target, not the host. The
  // path's shape, fixed when dispatch began, decides the target, since a
  // handler may detach nodes meanwhile: leaving a shadow root above the
  // target's tree retargets to its host, and entering a slot from a node
  // assigned to it goes deeper.
  const retarget = end > 0 && composed[0] !== event.target;
  let target: EventTarget | null = retarget ? composed[0] : event.target;
  let depth = 0;
  let targetDepth = 0;
  const handlers: Array<{
    el: Element;
    listener: Listener;
    target: EventTarget | null;
  }> = [];
  for (let i = 0; i < last; i++) {
    const node = path[i];
    if (node === container) break;
    if (retarget) {
      if (isShadowRoot(node)) {
        if (--depth < targetDepth) {
          target = node.host;
          targetDepth = depth;
        }
      } else if (i > 0 && (path[i - 1] as Element).assignedSlot === node) {
        depth++;
      }
    }
    if ((node as Node).nodeType !== 1) continue;
    // A nested container already ran the handlers below it.
    if (containerListeners.get(node as Element)?.has(eventName)) {
      handlers.length = 0;
    }
    const listeners = delegatedHandlers.get(node as Element)?.get(eventName);
    if (listeners) {
      for (const listener of listeners) {
        handlers.push({ el: node as Element, listener, target });
      }
    }
  }
  if (handlers.length === 0) return;
  const view = viewEvent(event);
  try {
    outsideRendering(() =>
      batch(() => {
        for (const { el, listener, target } of handlers) {
          view.current = el;
          view.target = target;
          invoke(listener, el, event);
          if (event.cancelBubble) break;
        }
      })
    );
  } finally {
    view.current = null;
    releaseEvent(event);
  }
}

function delegate(el: Element, listener: Listener): void {
  let byEvent = delegatedHandlers.get(el);
  if (!byEvent) delegatedHandlers.set(el, (byEvent = new Map()));
  let set = byEvent.get(listener.eventName);
  if (!set) byEvent.set(listener.eventName, (set = new Set()));
  set.add(listener);
  const usage = delegatedUsage.get(listener.eventName) ?? 0;
  delegatedUsage.set(listener.eventName, usage + 1);
  if (usage === 0) {
    for (const container of containers()) listen(container, listener.eventName);
  }
}

function undelegate(el: Element, listener: Listener): void {
  const eventName = listener.eventName;
  const byEvent = delegatedHandlers.get(el);
  const set = byEvent?.get(eventName);
  if (!set?.delete(listener)) return;
  if (set.size === 0) byEvent!.delete(eventName);
  if (byEvent!.size === 0) delegatedHandlers.delete(el);
  const usage = delegatedUsage.get(eventName)! - 1;
  if (usage > 0) {
    delegatedUsage.set(eventName, usage);
    return;
  }
  delegatedUsage.delete(eventName);
  for (const container of containerListeners.keys()) {
    unlisten(container, eventName);
  }
}

// ---------------------------------------------------------------------------
// Handler props

export function setListener(
  listeners: ListenerMap,
  el: Element,
  propName: string,
  event: ParsedEvent,
  handler: EventListener,
  owner: Owner | null
): void {
  const existing = listeners.get(propName);
  if (existing) {
    existing.handler = handler;
    return;
  }
  if (__ASKR_DEVELOPMENT_BUILD__) {
    warnUnknownEventProp(propName, event.eventName, el.localName);
  }
  const plain = !event.capture && !event.passive && !event.once;
  // Capture, passive and once handlers need a native listener of their own.
  if (
    plain &&
    DELEGATED_EVENTS.has(event.eventName) &&
    (roots.size > 0 || fallbackContainer())
  ) {
    const listener: Listener = {
      handler,
      owner,
      eventName: event.eventName,
      wrapped: null,
      options: undefined,
    };
    listeners.set(propName, listener);
    delegate(el, listener);
    return;
  }
  const options = listenerOptions(event);
  const listener: Listener = {
    handler,
    owner,
    eventName: event.eventName,
    options,
    wrapped: (nativeEvent: Event) => {
      outsideRendering(() => batch(() => invoke(listener, el, nativeEvent)));
    },
  };
  listeners.set(propName, listener);
  el.addEventListener(event.eventName, listener.wrapped!, options);
  const descendants = DESCENDANT_EVENT[event.eventName];
  if (plain && descendants && (roots.size > 0 || fallbackContainer())) {
    const companion: Listener = {
      // The element's own focus is the direct listener's. The swapped-in
      // handler is read at call time.
      handler(this: unknown, e: Event) {
        if (e.target !== el) listener.handler.call(this, e);
      },
      owner,
      eventName: descendants,
      wrapped: null,
      options: undefined,
    };
    listener.companion = companion;
    delegate(el, companion);
  }
}

export function removeListener(
  listeners: ListenerMap,
  el: Element,
  propName: string
): void {
  const listener = listeners.get(propName);
  if (!listener) return;
  listeners.delete(propName);
  if (listener.companion) undelegate(el, listener.companion);
  if (!listener.wrapped) {
    undelegate(el, listener);
    return;
  }
  el.removeEventListener(
    listener.eventName,
    listener.wrapped,
    listener.options
  );
}

export function removeAllListeners(
  listeners: ListenerMap,
  el: Element,
  errors: unknown[]
): void {
  for (const propName of Array.from(listeners.keys())) {
    try {
      removeListener(listeners, el, propName);
    } catch (error) {
      errors.push(error);
    }
  }
}
