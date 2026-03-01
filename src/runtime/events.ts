/**
 * Event delegation system for Askr
 *
 * Provides efficient event handling by attaching listeners to a container
 * instead of individual elements. This significantly reduces memory usage
 * and improves performance when many elements have the same event type.
 *
 * OPT-IN: Call enableEventDelegation() to use delegated event handling.
 */

import { globalScheduler } from './scheduler';
import { logger } from '../dev/logger';

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
  eventName: string;
  options?: AddEventListenerOptions;
}

const delegatedHandlers = new WeakMap<Element, Map<string, DelegatedHandler>>();

let eventDelegationEnabled = false;
let defaultContainer: Element | null = null;
let globalDelegationContainer: Element | null = null;
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
  if (!containerDelegatedListeners.has(container)) {
    containerDelegatedListeners.set(container, new Map());
  }
  const containerListeners = containerDelegatedListeners.get(container)!;

  const key = `${eventName}`;
  if (!containerListeners.has(key)) {
    const delegatedHandler = (e: Event) => {
      const target = e.target as Element;
      if (!target) return;

      const matchingElements = findMatchingElements(
        container,
        target,
        eventName
      );

      for (const matchingElement of matchingElements) {
        const elementHandlers = delegatedHandlers.get(matchingElement);
        if (elementHandlers) {
          const entry = elementHandlers.get(eventName);
          if (entry) {
            const event = e;
            globalScheduler.setInHandler(true);
            try {
              entry.handler(event);
            } catch (error) {
              logger.error('[Askr] Delegated event error:', error);
            } finally {
              globalScheduler.setInHandler(false);
            }
          }
        }

        // Check if propagation has been stopped after handling
        if (e.cancelBubble) break;
      }

      // Flush scheduler after all delegated handlers execute
      const state = globalScheduler.getState();
      if ((state.queueLength ?? 0) > 0 && !state.running) {
        queueMicrotask(() => {
          try {
            if (!globalScheduler.isExecuting()) globalScheduler.flush();
          } catch (err) {
            setTimeout(() => {
              throw err;
            });
          }
        });
      }
    };

    const passiveOptions = getPassiveOptions(eventName);
    const listenerOptions = passiveOptions ?? options;

    container.addEventListener(eventName, delegatedHandler, listenerOptions);
    containerListeners.set(key, delegatedHandler);
  }

  if (!delegatedHandlers.has(element)) {
    delegatedHandlers.set(element, new Map());
  }
  const elementHandlers = delegatedHandlers.get(element)!;
  elementHandlers.set(eventName, {
    handler,
    original: originalHandler,
    element,
    eventName,
    options,
  });
}

function findMatchingElements(
  container: Element,
  target: Element,
  _eventName: string
): Element[] {
  const matches: Element[] = [];
  let current: Element | null = target;

  while (current && current !== container) {
    matches.push(current);
    current = current.parentElement;
  }

  return matches;
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

  attachDelegatedListener(
    container,
    element,
    eventName,
    handler,
    originalHandler,
    options
  );
}

export function removeDelegatedListener(
  element: Element,
  eventName: string
): void {
  const elementHandlers = delegatedHandlers.get(element);
  if (elementHandlers) {
    elementHandlers.delete(eventName);
    if (elementHandlers.size === 0) {
      delegatedHandlers.delete(element);
    }
  }
}

export function getDelegatedHandlersForElement(
  element: Element
): Map<string, DelegatedHandler> | undefined {
  return delegatedHandlers.get(element);
}

export function hasDelegatedHandler(
  element: Element,
  eventName: string
): boolean {
  const elementHandlers = delegatedHandlers.get(element);
  return elementHandlers ? elementHandlers.has(eventName) : false;
}

export function clearDelegatedHandlersForElement(element: Element): void {
  delegatedHandlers.delete(element);
}

export function getDelegatedEventNames(): readonly (keyof DelegatedEventMap)[] {
  return DELEGATED_EVENTS;
}

export function isDelegatedEvent(eventName: string): boolean {
  return DELEGATED_EVENTS.includes(eventName as keyof DelegatedEventMap);
}
