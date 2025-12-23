/**
 * Shared utilities for the renderer module.
 * Consolidates common patterns to reduce code duplication.
 */

import { globalScheduler } from '../runtime/scheduler';
import { logger } from '../dev/logger';
import { __ASKR_set, __ASKR_incCounter } from './diag';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface ListenerEntry {
  handler: EventListener;
  original: EventListener;
  options?: boolean | AddEventListenerOptions;
}

// ─────────────────────────────────────────────────────────────────────────────
// Event Handler Utilities
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parse an event prop name (e.g., 'onClick') to its DOM event name (e.g., 'click')
 */
export function parseEventName(propName: string): string | null {
  if (!propName.startsWith('on') || propName.length <= 2) return null;
  return (
    propName.slice(2).charAt(0).toLowerCase() + propName.slice(3).toLowerCase()
  );
}

/**
 * Get default event listener options for passive events
 */
export function getPassiveOptions(
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

/**
 * Create a wrapped event handler that integrates with the scheduler
 */
export function createWrappedHandler(
  handler: EventListener,
  flushAfter = false
): EventListener {
  return (event: Event) => {
    globalScheduler.setInHandler(true);
    try {
      handler(event);
    } catch (error) {
      logger.error('[Askr] Event handler error:', error);
    } finally {
      globalScheduler.setInHandler(false);
      if (flushAfter) {
        // If the handler enqueued tasks while we disallowed microtask kicks,
        // ensure we schedule a microtask to flush them
        const state = globalScheduler.getState();
        if ((state.queueLength ?? 0) > 0 && !state.running) {
          queueMicrotask(() => {
            try {
              if (!globalScheduler.isExecuting()) globalScheduler.flush();
            } catch (err) {
              queueMicrotask(() => {
                throw err;
              });
            }
          });
        }
      }
    }
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Prop/Attribute Utilities
// ─────────────────────────────────────────────────────────────────────────────

/** Props that should be skipped during attribute processing */
export function isSkippedProp(key: string): boolean {
  return key === 'children' || key === 'key';
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
      return el.className !== String(value);
    }
    if (key === 'value' || key === 'checked') {
      return (el as HTMLElement & Record<string, unknown>)[key] !== value;
    }
    const attr = el.getAttribute(key);
    if (value === undefined || value === null || value === false) {
      return attr !== null;
    }
    return String(value) !== attr;
  } catch {
    return true;
  }
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
  if (rawKey === undefined) return undefined;
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
  const children = Array.from(parent.children);
  for (const ch of children) {
    const k = ch.getAttribute('data-key');
    if (k !== null) {
      map.set(k, ch);
      const n = Number(k);
      if (!Number.isNaN(n)) map.set(n, ch);
    }
  }
  return map;
}

// ─────────────────────────────────────────────────────────────────────────────
// Diagnostic Utilities
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Record DOM replace operation for diagnostics
 */
export function recordDOMReplace(source: string): void {
  try {
    __ASKR_incCounter('__DOM_REPLACE_COUNT');
    __ASKR_set(`__LAST_DOM_REPLACE_STACK_${source}`, new Error().stack);
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
    __ASKR_set('__LAST_FASTPATH_STATS', stats);
    __ASKR_set('__LAST_FASTPATH_COMMIT_COUNT', 1);
    if (counterName) {
      __ASKR_incCounter(counterName);
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
  if (
    process.env.ASKR_FASTPATH_DEBUG === '1' ||
    process.env.ASKR_FASTPATH_DEBUG === 'true'
  ) {
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
