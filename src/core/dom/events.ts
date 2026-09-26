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

import { reportUncaughtError } from '../../common/report-error';
import { runWithOwner, type Owner } from '../reactive/owner';
import { batch } from '../reactive/scheduler';
import { outsideRendering } from '../component/render-state';

export interface ParsedEvent {
  readonly eventName: string;
  readonly capture: boolean;
}

export interface Listener {
  handler: EventListener;
  readonly owner: Owner | null;
  readonly eventName: string;
  /** Null for a delegated handler, which has no native listener of its own. */
  readonly wrapped: EventListener | null;
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
  'touchend',
  'touchcancel',
  'keydown',
  'keyup',
  'keypress',
  'input',
]);

/** `onClick` -> click, `onKeyDownCapture` -> keydown (capture); else null. */
export function parseEventProp(propName: string): ParsedEvent | null {
  if (propName.length <= 2 || !propName.startsWith('on')) return null;
  const capture =
    propName.endsWith('Capture') &&
    !propName.endsWith('PointerCapture') &&
    propName.length > 'onCapture'.length;
  const name = capture ? propName.slice(0, -'Capture'.length) : propName;
  if (name.length <= 2) return null;
  return { eventName: name.slice(2).toLowerCase(), capture };
}

/**
 * `wheel`, `touchstart` and `touchmove` opt out of passive defaults so a
 * handler can call `preventDefault()`; `scroll` is always passive.
 */
function listenerOptions(
  eventName: string,
  capture: boolean
): AddEventListenerOptions | undefined {
  let options: AddEventListenerOptions | undefined;
  if (eventName === 'scroll') options = { passive: true };
  else if (
    eventName === 'wheel' ||
    eventName === 'touchstart' ||
    eventName === 'touchmove'
  ) {
    options = { passive: false };
  }
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

/** Delegated handlers per element, by event type. */
const delegatedHandlers = new WeakMap<Element, Map<string, Listener>>();
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

/** The event as seen by one element's handler. */
function eventFor(
  event: Event,
  currentTarget: Element,
  target: EventTarget | null
): Event {
  return new Proxy(event, {
    get(native, property) {
      if (property === 'currentTarget') return currentTarget;
      if (property === 'target') return target;
      // Native accessors require the original event as their receiver.
      const value = Reflect.get(native, property, native);
      return typeof value === 'function' ? value.bind(native) : value;
    },
  });
}

function dispatch(event: Event, eventName: string): void {
  const container = event.currentTarget as Element;
  // composedPath() reaches into open shadow roots below the container, which
  // the target (retargeted to the shadow host here) and its parents do not.
  const composed = event.composedPath?.() ?? [];
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
    const listener = delegatedHandlers.get(node as Element)?.get(eventName);
    if (listener) handlers.push({ el: node as Element, listener, target });
  }
  if (handlers.length === 0) return;
  outsideRendering(() =>
    batch(() => {
      for (const { el, listener, target } of handlers) {
        invoke(listener, el, eventFor(event, el, target));
        if (event.cancelBubble) break;
      }
    })
  );
}

function delegate(el: Element, listener: Listener): void {
  let byEvent = delegatedHandlers.get(el);
  if (!byEvent) delegatedHandlers.set(el, (byEvent = new Map()));
  byEvent.set(listener.eventName, listener);
  const usage = delegatedUsage.get(listener.eventName) ?? 0;
  delegatedUsage.set(listener.eventName, usage + 1);
  if (usage === 0) {
    for (const container of containers()) listen(container, listener.eventName);
  }
}

function undelegate(el: Element, eventName: string): void {
  const byEvent = delegatedHandlers.get(el);
  if (!byEvent?.delete(eventName)) return;
  if (byEvent.size === 0) delegatedHandlers.delete(el);
  const usage = delegatedUsage.get(eventName)! - 1;
  if (usage > 0) {
    delegatedUsage.set(eventName, usage);
    return;
  }
  delegatedUsage.delete(eventName);
  for (const container of [...containerListeners.keys()]) {
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
  if (
    !event.capture &&
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
  const options = listenerOptions(event.eventName, event.capture);
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
}

export function removeListener(
  listeners: ListenerMap,
  el: Element,
  propName: string
): void {
  const listener = listeners.get(propName);
  if (!listener) return;
  listeners.delete(propName);
  if (!listener.wrapped) {
    undelegate(el, listener.eventName);
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
