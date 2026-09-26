/**
 * Event handler props on rendered elements.
 *
 * Each handler prop installs one native listener whose handler can be swapped
 * without re-adding it. A handler runs in a batch (state writes flush once,
 * synchronously, when it returns) with its component as the current owner.
 * A throwing handler is reported like an uncaught listener exception.
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
  readonly wrapped: EventListener;
  readonly eventName: string;
  readonly options: AddEventListenerOptions | undefined;
}

export type ListenerMap = Map<string, Listener>;

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
  const options = listenerOptions(event.eventName, event.capture);
  const listener: Listener = {
    handler,
    eventName: event.eventName,
    options,
    wrapped: (nativeEvent: Event) => {
      const current = listener.handler;
      outsideRendering(() =>
        batch(() =>
          runWithOwner(owner, () => {
            try {
              current.call(el, nativeEvent);
            } catch (error) {
              reportUncaughtError(error);
            }
          })
        )
      );
    },
  };
  listeners.set(propName, listener);
  el.addEventListener(event.eventName, listener.wrapped, options);
}

export function removeListener(
  listeners: ListenerMap,
  el: Element,
  propName: string
): void {
  const listener = listeners.get(propName);
  if (!listener) return;
  listeners.delete(propName);
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
