/**
 * Shared utilities for the renderer module.
 * Consolidates common patterns to reduce code duplication.
 */

import { runRuntimeHandlerScope } from '../runtime';
import { logger } from '../common/logger';
import { getPublicAttributeName } from '../common/attr-names';
import { getRuntimeEnv } from './env';
import { setDevValue, incDevCounter } from '../runtime';

declare const __ASKR_DEVELOPMENT_BUILD__: boolean;

const DEVELOPMENT_BUILD_ENABLED = __ASKR_DEVELOPMENT_BUILD__;

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

// Keep direct replaceChildren(...nodes) commits below a conservative argument
// count until browser benchmarks prove larger spreads are safe.
export const DIRECT_REPLACE_CHILDREN_SPREAD_LIMIT = 4096;

export function canUseDirectReplaceChildrenSpread(count: number): boolean {
  return count <= DIRECT_REPLACE_CHILDREN_SPREAD_LIMIT;
}

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface ListenerEntry {
  handler: EventListener;
  original: EventListener;
  eventName: string;
  options?: boolean | AddEventListenerOptions;
  updateHandler?: (nextHandler: EventListener) => void;
}

export interface ParsedEventProp {
  eventName: string;
  capture: boolean;
}

const CLICK_EVENT_PROP: ParsedEventProp = {
  eventName: 'click',
  capture: false,
};
const CLICK_CAPTURE_EVENT_PROP: ParsedEventProp = {
  eventName: 'click',
  capture: true,
};

// ─────────────────────────────────────────────────────────────────────────────
// Event Handler Utilities
// ─────────────────────────────────────────────────────────────────────────────

// Handler pooling cache to avoid recreating wrapped handlers
// Key: handler reference, Value: { wrapped: EventListener, flushAfter: boolean }
const handlerCache = new WeakMap<EventListener, Map<boolean, EventListener>>();
let cacheSize = 0;
const MAX_CACHE_SIZE = 1000;

/**
 * Parse an event prop name (e.g., 'onClick') to its DOM event name (e.g., 'click')
 */
export function parseEventName(propName: string): string | null {
  return parseEventProp(propName)?.eventName ?? null;
}

export function parseEventProp(propName: string): ParsedEventProp | null {
  if (propName === 'onClick') return CLICK_EVENT_PROP;
  if (propName === 'onClickCapture') return CLICK_CAPTURE_EVENT_PROP;
  if (!propName.startsWith('on') || propName.length <= 2) return null;
  const capture =
    propName.endsWith('Capture') &&
    !propName.endsWith('PointerCapture') &&
    propName.length > 'onCapture'.length;
  const normalizedPropName = capture
    ? propName.slice(0, -'Capture'.length)
    : propName;

  return normalizedPropName.length <= 2
    ? null
    : {
        eventName:
          normalizedPropName.slice(2).charAt(0).toLowerCase() +
          normalizedPropName.slice(3).toLowerCase(),
        capture,
      };
}

export function getEventListenerKey(
  eventName: string,
  capture = false
): string {
  return capture ? `${eventName}:capture` : eventName;
}

export function getEventListenerOptions(
  eventName: string,
  capture = false
): AddEventListenerOptions | undefined {
  const passiveOptions = getPassiveOptions(eventName);
  if (!capture) {
    return passiveOptions;
  }

  return passiveOptions
    ? { ...passiveOptions, capture: true }
    : { capture: true };
}

/**
 * Get default event listener options for passive events
 */
export function getPassiveOptions(
  eventName: string
): AddEventListenerOptions | undefined {
  if (eventName === 'scroll') {
    return { passive: true };
  }
  return undefined;
}

/**
 * Create a wrapped event handler that integrates with the scheduler
 * Uses caching to avoid recreating wrappers for the same handler
 */
export function createWrappedHandler(
  handler: EventListener,
  flushAfter = false
): EventListener {
  // Check cache first
  const cachedByFlush = handlerCache.get(handler);
  if (cachedByFlush) {
    const cached = cachedByFlush.get(flushAfter);
    if (cached) return cached;
  }

  const wrapped: EventListener = (event: Event) => {
    try {
      runRuntimeHandlerScope(
        () => {
          try {
            handler(event);
          } catch (error) {
            logger.error('[Askr] Event handler error:', error);
          }
        },
        flushAfter ? 'sync' : 'defer'
      );
    } catch (err) {
      if (flushAfter) {
        queueMicrotask(() => {
          throw err;
        });
      } else {
        logger.error('[Askr] Event handler error:', err);
      }
    }
  };

  // Cache the wrapped handler
  try {
    if (!handlerCache.has(handler)) {
      // Limit cache size to prevent memory leaks
      if (cacheSize >= MAX_CACHE_SIZE) {
        // Simple eviction - just don't cache new entries when full
      } else {
        cacheSize++;
        handlerCache.set(handler, new Map());
      }
    }
    handlerCache.get(handler)?.set(flushAfter, wrapped);
  } catch {
    // WeakMap can throw if handler is not a valid key
  }

  return wrapped;
}

export function createMutableWrappedHandler(
  handler: EventListener,
  flushAfter = false
): {
  handler: EventListener;
  updateHandler: (nextHandler: EventListener) => void;
} {
  let currentHandler = handler;

  const wrapped: EventListener = (event: Event) => {
    try {
      runRuntimeHandlerScope(
        () => {
          try {
            currentHandler(event);
          } catch (error) {
            logger.error('[Askr] Event handler error:', error);
          }
        },
        flushAfter ? 'sync' : 'defer'
      );
    } catch (err) {
      if (flushAfter) {
        queueMicrotask(() => {
          throw err;
        });
      } else {
        logger.error('[Askr] Event handler error:', err);
      }
    }
  };

  return {
    handler: wrapped,
    updateHandler(nextHandler: EventListener) {
      currentHandler = nextHandler;
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Prop/Attribute Utilities
// ─────────────────────────────────────────────────────────────────────────────

/** Props that should be skipped during attribute processing */
export function isSkippedProp(key: string): boolean {
  return (
    key === 'children' ||
    key === 'imperativeChildren' ||
    key === 'key' ||
    key === 'ref'
  );
}

/** Check if prop should be ignored for prop-change detection */
export function isIgnoredForPropChanges(key: string): boolean {
  if (key === 'children' || key === 'key') return true;
  if (key.startsWith('on') && key.length > 2) return true;
  if (key.startsWith('data-')) return true;
  return false;
}

/**
 * Check if an element's current attribute value differs from vnode value
 */
export function hasPropChanged(
  el: Element,
  key: string,
  value: unknown
): boolean {
  try {
    if (key === 'class' || key === 'className') {
      return readElementClassName(el) !== String(value);
    }
    if (key === 'value' || key === 'checked') {
      return (el as HTMLElement & Record<string, unknown>)[key] !== value;
    }
    const attr = el.getAttribute(getRenderedAttributeName(el, key));
    if (value === undefined || value === null || value === false) {
      return attr !== null;
    }
    return String(value) !== attr;
  } catch {
    return true;
  }
}

export function isSVGDomElement(el: Element): el is SVGElement {
  return typeof SVGElement !== 'undefined' && el instanceof SVGElement;
}

export function getRenderedAttributeName(
  el: Element,
  propName: string
): string {
  const attributeName = getPublicAttributeName(propName);

  return el.namespaceURI === SVG_NAMESPACE
    ? attributeName
    : attributeName.toLowerCase();
}

export function setRenderedAttribute(
  el: Element,
  propName: string,
  value: string
): void {
  el.setAttribute(getRenderedAttributeName(el, propName), value);
}

export function removeRenderedAttribute(el: Element, propName: string): void {
  el.removeAttribute(getRenderedAttributeName(el, propName));
}

export function readElementClassName(el: Element): string {
  if (isSVGDomElement(el)) {
    return el.getAttribute('class') ?? '';
  }

  return (el as HTMLElement).className;
}

export function writeElementClassName(el: Element, value: string): void {
  if (isSVGDomElement(el)) {
    if (value.length > 0) {
      el.setAttribute('class', value);
    } else {
      el.removeAttribute('class');
    }
    return;
  }

  (el as HTMLElement).className = value;
}

export function tagNamesEqualIgnoreCase(a: string, b: string): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;

  for (let index = 0; index < a.length; index += 1) {
    const aCode = a.charCodeAt(index);
    const bCode = b.charCodeAt(index);
    if (aCode === bCode) continue;

    const normalizedA = aCode >= 65 && aCode <= 90 ? aCode + 32 : aCode;
    const normalizedB = bCode >= 65 && bCode <= 90 ? bCode + 32 : bCode;
    if (normalizedA !== normalizedB) return false;
  }

  return true;
}

/**
 * Check if a vnode has non-trivial props (excluding events and data-*)
 */
export function hasNonTrivialProps(props: Record<string, unknown>): boolean {
  for (const k of Object.keys(props)) {
    if (isIgnoredForPropChanges(k)) continue;
    return true;
  }
  return false;
}

/**
 * Check for prop changes between vnode and existing element
 */
export function checkPropChanges(
  el: Element,
  props: Record<string, unknown>
): boolean {
  for (const k of Object.keys(props)) {
    if (isIgnoredForPropChanges(k)) continue;
    if (hasPropChanged(el, k, props[k])) {
      return true;
    }
  }
  return false;
}

// ─────────────────────────────────────────────────────────────────────────────
// Key Utilities
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Extract key from a vnode object
 */
export function extractKey(vnode: unknown): string | number | undefined {
  if (typeof vnode !== 'object' || vnode === null) return undefined;
  const obj = vnode as Record<string, unknown>;
  const rawKey =
    obj.key ?? (obj.props as Record<string, unknown> | undefined)?.key;
  if (rawKey === undefined || rawKey === null) return undefined;
  return typeof rawKey === 'symbol'
    ? String(rawKey)
    : (rawKey as string | number);
}

/**
 * Build a key map from element's children
 */
export function buildKeyMapFromChildren(
  parent: Element
): Map<string | number, Element> {
  const map = new Map<string | number, Element>();
  for (let ch = parent.firstElementChild; ch; ch = ch.nextElementSibling) {
    const key = getMaterializedKey(ch);
    if (key !== undefined) {
      map.set(key, ch);
    }
  }
  return map;
}

export function getMaterializedKey(
  element: Element
): string | number | undefined {
  const value = element.getAttribute('data-key');
  if (value === null) return undefined;
  return element.getAttribute('data-askr-key-kind') === 'number'
    ? Number(value)
    : value;
}

// ─────────────────────────────────────────────────────────────────────────────
// Diagnostic Utilities
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Record DOM replace operation for diagnostics
 */
export function recordDOMReplace(source: string): void {
  try {
    incDevCounter('__DOM_REPLACE_COUNT');
    setDevValue(`__LAST_DOM_REPLACE_STACK_${source}`, new Error().stack);
  } catch {
    // ignore
  }
}

/**
 * Record fast-path stats for diagnostics
 */
export function recordFastPathStats(
  stats: Record<string, unknown>,
  counterName?: string
): void {
  try {
    setDevValue('__LAST_FASTPATH_STATS', stats);
    setDevValue('__LAST_FASTPATH_COMMIT_COUNT', 1);
    if (counterName) {
      incDevCounter(counterName);
    }
  } catch {
    // ignore
  }
}

/**
 * Conditionally log debug info for fast-path operations
 */
export function logFastPathDebug(
  message: string,
  indexOrData?: number | unknown,
  data?: unknown
): void {
  if (!DEVELOPMENT_BUILD_ENABLED) {
    return;
  }
  const env = getRuntimeEnv();
  if (env.ASKR_FASTPATH_DEBUG === '1' || env.ASKR_FASTPATH_DEBUG === 'true') {
    if (data !== undefined) {
      logger.warn(`[Askr][FASTPATH] ${message}`, indexOrData, data);
    } else if (indexOrData !== undefined) {
      logger.warn(`[Askr][FASTPATH] ${message}`, indexOrData);
    } else {
      logger.warn(`[Askr][FASTPATH] ${message}`);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Performance Utilities
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get current high-resolution timestamp
 */
export function now(): number {
  return typeof performance !== 'undefined' && performance.now
    ? performance.now()
    : Date.now();
}
