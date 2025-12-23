import { globalScheduler } from '../runtime/scheduler';
import { logger } from '../dev/logger';
import type { Props } from '../shared/types';
import { elementListeners } from './cleanup';
import { keyedElements } from './keyed';
import { reconcileKeyedChildren } from './reconcile';
import { _isDOMElement, type DOMElement, type VNode } from './types';
import {
  createDOMNode,
  updateElementFromVnode,
  updateUnkeyedChildren,
  performBulkPositionalKeyedTextUpdate,
  performBulkTextReplace,
  isBulkTextFastPathEligible,
} from './dom';
import { __ASKR_set, __ASKR_incCounter } from './diag';
import { Fragment } from '../jsx/types';

/**
 * Internal marker for component-owned DOM ranges
 * Allows efficient partial DOM updates instead of clearing entire target
 */
interface DOMRange {
  start: Node; // Start marker (comment node)
  end: Node; // End marker (comment node)
}

export const IS_DOM_AVAILABLE = typeof document !== 'undefined';

const domRanges = new WeakMap<object, DOMRange>();

// ─────────────────────────────────────────────────────────────────────────────
// Helper Types & Utilities
// ─────────────────────────────────────────────────────────────────────────────

interface SimpleTextResult {
  isSimple: true;
  text: string;
}

interface NotSimpleTextResult {
  isSimple: false;
  text?: undefined;
}

type TextCheckResult = SimpleTextResult | NotSimpleTextResult;

/**
 * Check if vnode children represent a simple text value
 */
function checkSimpleText(vnodeChildren: unknown): TextCheckResult {
  if (!Array.isArray(vnodeChildren)) {
    if (
      typeof vnodeChildren === 'string' ||
      typeof vnodeChildren === 'number'
    ) {
      return { isSimple: true, text: String(vnodeChildren) };
    }
  } else if (vnodeChildren.length === 1) {
    const child = vnodeChildren[0];
    if (typeof child === 'string' || typeof child === 'number') {
      return { isSimple: true, text: String(child) };
    }
  }
  return { isSimple: false };
}

/**
 * Try to update a single text node in place
 * Returns true if update was performed, false otherwise
 */
function tryUpdateTextInPlace(element: Element, text: string): boolean {
  if (
    element.childNodes.length === 1 &&
    element.firstChild?.nodeType === 3 // TEXT_NODE
  ) {
    (element.firstChild as Text).data = text;
    return true;
  }
  return false;
}

/**
 * Build a key map from existing DOM children
 */
function buildKeyMapFromDOM(parent: Element): Map<string | number, Element> {
  const keyMap = new Map<string | number, Element>();
  const children = Array.from(parent.children);
  for (const child of children) {
    const k = child.getAttribute('data-key');
    if (k !== null) {
      keyMap.set(k, child);
      const n = Number(k);
      if (!Number.isNaN(n)) keyMap.set(n, child);
    }
  }
  return keyMap;
}

/**
 * Get or initialize key map for an element
 */
function getOrBuildKeyMap(
  parent: Element
): Map<string | number, Element> | undefined {
  let keyMap = keyedElements.get(parent);
  if (!keyMap) {
    keyMap = buildKeyMapFromDOM(parent);
    if (keyMap.size > 0) {
      keyedElements.set(parent, keyMap);
    }
  }
  return keyMap.size > 0 ? keyMap : undefined;
}

/**
 * Check if children array contains keyed elements
 */
function hasKeyedChildren(children: unknown[]): boolean {
  return children.some(
    (child) => typeof child === 'object' && child !== null && 'key' in child
  );
}

/**
 * Track bulk text fast-path stats (dev only)
 */
function trackBulkTextStats(
  stats: ReturnType<typeof performBulkTextReplace>
): void {
  if (process.env.NODE_ENV !== 'production') {
    try {
      __ASKR_set('__LAST_BULK_TEXT_FASTPATH_STATS', stats);
      __ASKR_incCounter('bulkTextHits');
    } catch {
      // ignore
    }
  }
}

/**
 * Track bulk text miss (dev only)
 */
function trackBulkTextMiss(): void {
  if (process.env.NODE_ENV !== 'production') {
    try {
      __ASKR_incCounter('bulkTextMisses');
    } catch {
      // ignore
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Child Reconciliation Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Reconcile keyed children with optional forced bulk path
 */
function reconcileKeyed(
  parent: Element,
  children: VNode[],
  oldKeyMap: Map<string | number, Element> | undefined
): void {
  // Optional forced positional bulk path for large keyed lists
  if (process.env.ASKR_FORCE_BULK_POSREUSE === '1') {
    const result = tryForcedBulkKeyedPath(parent, children);
    if (result) return;
  }

  // Standard keyed reconciliation
  const newKeyMap = reconcileKeyedChildren(parent, children, oldKeyMap);
  keyedElements.set(parent, newKeyMap);
}

/**
 * Try the forced bulk keyed positional path
 * Returns true if applied, false to fall back to normal reconciliation
 */
function tryForcedBulkKeyedPath(parent: Element, children: VNode[]): boolean {
  try {
    const keyedVnodes: Array<{ key: string | number; vnode: VNode }> = [];
    for (const child of children) {
      if (_isDOMElement(child) && (child as DOMElement).key !== undefined) {
        keyedVnodes.push({
          key: (child as DOMElement).key as string | number,
          vnode: child,
        });
      }
    }

    // Only apply when all children are keyed and count matches
    if (keyedVnodes.length === 0 || keyedVnodes.length !== children.length) {
      return false;
    }

    if (
      process.env.ASKR_FASTPATH_DEBUG === '1' ||
      process.env.ASKR_FASTPATH_DEBUG === 'true'
    ) {
      logger.warn(
        '[Askr][FASTPATH] forced positional bulk keyed reuse (evaluate-level)'
      );
    }

    const stats = performBulkPositionalKeyedTextUpdate(parent, keyedVnodes);

    if (
      process.env.NODE_ENV !== 'production' ||
      process.env.ASKR_FASTPATH_DEBUG === '1'
    ) {
      try {
        __ASKR_set('__LAST_FASTPATH_STATS', stats);
        __ASKR_set('__LAST_FASTPATH_COMMIT_COUNT', 1);
        __ASKR_incCounter('bulkKeyedPositionalForced');
      } catch {
        // ignore
      }
    }

    // Rebuild keyed map from DOM
    const newMap = buildKeyMapFromDOM(parent);
    keyedElements.set(parent, newMap);
    return true;
  } catch (err) {
    if (
      process.env.ASKR_FASTPATH_DEBUG === '1' ||
      process.env.ASKR_FASTPATH_DEBUG === 'true'
    ) {
      logger.warn(
        '[Askr][FASTPATH] forced bulk path failed, falling back',
        err
      );
    }
    return false;
  }
}

/**
 * Reconcile unkeyed children, using bulk fast-path when eligible
 */
function reconcileUnkeyed(parent: Element, children: VNode[]): void {
  if (isBulkTextFastPathEligible(parent, children)) {
    const stats = performBulkTextReplace(parent, children);
    trackBulkTextStats(stats);
  } else {
    trackBulkTextMiss();
    updateUnkeyedChildren(parent, children);
  }
  keyedElements.delete(parent);
}

/**
 * Update element children (handles keyed, unkeyed, and non-array cases)
 */
function updateElementChildren(element: Element, vnodeChildren: unknown): void {
  if (!vnodeChildren) {
    element.textContent = '';
    keyedElements.delete(element);
    return;
  }

  if (!Array.isArray(vnodeChildren)) {
    element.textContent = '';
    const dom = createDOMNode(vnodeChildren);
    if (dom) element.appendChild(dom);
    keyedElements.delete(element);
    return;
  }

  if (hasKeyedChildren(vnodeChildren)) {
    const oldKeyMap = getOrBuildKeyMap(element);
    try {
      reconcileKeyed(element, vnodeChildren, oldKeyMap);
    } catch {
      // Fall back on error
      const newKeyMap = reconcileKeyedChildren(
        element,
        vnodeChildren,
        oldKeyMap
      );
      keyedElements.set(element, newKeyMap);
    }
  } else {
    reconcileUnkeyed(element, vnodeChildren);
  }
}

/**
 * Perform a smart update on an existing element
 * Tries text-in-place update first, then full child reconciliation
 */
function smartUpdateElement(element: Element, vnode: DOMElement): void {
  const vnodeChildren = vnode.children || vnode.props?.children;
  const textCheck = checkSimpleText(vnodeChildren);

  if (textCheck.isSimple && tryUpdateTextInPlace(element, textCheck.text)) {
    // Text updated in place, nothing more to do for children
  } else {
    updateElementChildren(element, vnodeChildren);
  }

  updateElementFromVnode(element, vnode, false);
}

/**
 * Process Fragment children with smart updates for each child
 */
function processFragmentChildren(target: Element, childArray: unknown[]): void {
  const existingChildren = Array.from(target.children) as Element[];

  for (let i = 0; i < childArray.length; i++) {
    const childVnode = childArray[i];
    const existingNode = existingChildren[i];

    // Apply the same smart update logic as the single-element case
    if (
      existingNode &&
      _isDOMElement(childVnode) &&
      typeof (childVnode as DOMElement).type === 'string' &&
      existingNode.tagName.toLowerCase() ===
        ((childVnode as DOMElement).type as string).toLowerCase()
    ) {
      // Same element type - do smart update
      smartUpdateElement(existingNode, childVnode as DOMElement);
      continue;
    }

    // Different type or no existing node - replace
    const newDom = createDOMNode(childVnode);
    if (newDom) {
      if (existingNode) {
        target.replaceChild(newDom, existingNode);
      } else {
        target.appendChild(newDom);
      }
    }
  }

  // Remove extra children
  while (target.children.length > childArray.length) {
    target.removeChild(target.lastChild!);
  }
}

/**
 * Create a wrapped event handler that integrates with the scheduler
 */
function createWrappedEventHandler(handler: EventListener): EventListener {
  return (event: Event) => {
    globalScheduler.setInHandler(true);
    try {
      handler(event);
    } catch (error) {
      logger.error('[Askr] Event handler error:', error);
    } finally {
      globalScheduler.setInHandler(false);
    }
  };
}

/**
 * Apply props/attributes to an element (used for first render with keyed children)
 */
function applyPropsToElement(el: Element, props: Props): void {
  for (const [key, value] of Object.entries(props)) {
    if (key === 'children' || key === 'key') continue;
    if (value === undefined || value === null || value === false) continue;

    if (key.startsWith('on') && key.length > 2) {
      const eventName =
        key.slice(2).charAt(0).toLowerCase() + key.slice(3).toLowerCase();

      const wrappedHandler = createWrappedEventHandler(value as EventListener);

      const options: boolean | AddEventListenerOptions | undefined =
        eventName === 'wheel' ||
        eventName === 'scroll' ||
        eventName.startsWith('touch')
          ? { passive: true }
          : undefined;

      if (options !== undefined) {
        el.addEventListener(eventName, wrappedHandler, options);
      } else {
        el.addEventListener(eventName, wrappedHandler);
      }

      if (!elementListeners.has(el)) {
        elementListeners.set(el, new Map());
      }
      elementListeners.get(el)!.set(eventName, {
        handler: wrappedHandler,
        original: value as EventListener,
        options,
      });
      continue;
    }

    if (key === 'class' || key === 'className') {
      el.className = String(value);
    } else if (key === 'value' || key === 'checked') {
      (el as HTMLElement & Props)[key] = value;
    } else {
      el.setAttribute(key, String(value));
    }
  }
}

/**
 * Try to handle first render of element with keyed children
 * Returns true if handled, false to fall back to default rendering
 */
function tryFirstRenderKeyedChildren(
  target: Element,
  vnode: DOMElement
): boolean {
  const children = vnode.children;
  if (!Array.isArray(children) || !hasKeyedChildren(children)) {
    return false;
  }

  const el = document.createElement(vnode.type as string);
  target.appendChild(el);

  applyPropsToElement(el, vnode.props || {});

  const newKeyMap = reconcileKeyedChildren(el, children, undefined);
  keyedElements.set(el, newKeyMap);
  return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// Fragment Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Check if a vnode is a Fragment
 */
function isFragment(vnode: unknown): vnode is DOMElement {
  return (
    _isDOMElement(vnode) &&
    typeof (vnode as DOMElement).type === 'symbol' &&
    ((vnode as DOMElement).type === Fragment ||
      String((vnode as DOMElement).type) === 'Symbol(askr.fragment)')
  );
}

/**
 * Unwrap Fragment to get children array
 */
function getFragmentChildren(vnode: DOMElement): unknown[] {
  const fragmentChildren = vnode.props?.children || vnode.children || [];
  return Array.isArray(fragmentChildren)
    ? fragmentChildren
    : [fragmentChildren];
}

export function evaluate(
  node: unknown,
  target: Element | null,
  context?: object
): void {
  if (!target) return;
  // SSR guard: avoid DOM ops when not in a browser-like environment
  if (typeof document === 'undefined') {
    if (process.env.NODE_ENV !== 'production') {
      try {
        // Keep this lightweight and non-throwing so test harnesses and SSR
        // imports don't crash at runtime; callers should avoid calling
        // `evaluate` in SSR, but we make it safe as a no-op.
        console.warn('[Askr] evaluate() called in non-DOM environment; no-op.');
      } catch (e) {
        void e;
      }
    }
    return;
  }
  // Debug tracing to help understand why initial mounts sometimes don't
  // result in DOM mutations during tests.

  // If context provided, use component-owned DOM range (only replace that range)
  if (context && domRanges.has(context)) {
    const range = domRanges.get(context)!;
    // Remove all nodes between start and end markers
    let current = range.start.nextSibling;
    while (current && current !== range.end) {
      const next = current.nextSibling;
      current.remove();
      current = next;
    }
    // Append new DOM before end marker
    const dom = createDOMNode(node);
    if (dom) {
      target.insertBefore(dom, range.end);
    }
  } else if (context) {
    // First render with context: create range markers
    const start = document.createComment('component-start');
    const end = document.createComment('component-end');
    target.appendChild(start);
    target.appendChild(end);
    domRanges.set(context, { start, end });
    // Render into the range
    const dom = createDOMNode(node);
    if (dom) {
      target.insertBefore(dom, end);
    }
  } else {
    // Root render (no context): smart update strategy
    // If target has exactly one child of the same element type as the vnode,
    // reuse the element and just update its content.
    // This preserves the element reference and event handlers across renders.

    let vnode = node;

    // If vnode is a Fragment, unwrap it to get the actual content for the smart update path.
    // Fragments become invisible in the DOM - their children are placed directly in the parent.
    // So for smart updates, we need to compare against the Fragment's children, not the Fragment itself.
    if (isFragment(vnode)) {
      const childArray = getFragmentChildren(vnode as DOMElement);
      // If Fragment has exactly one child that's an element, unwrap to that child
      // This allows the smart update path to match against it
      if (
        childArray.length === 1 &&
        _isDOMElement(childArray[0]) &&
        typeof (childArray[0] as DOMElement).type === 'string'
      ) {
        vnode = childArray[0];
      } else {
        // Fragment with multiple children - process each child with full smart update logic
        processFragmentChildren(target, childArray);
        return;
      }
    }

    const firstChild = target.children[0] as Element | undefined;

    if (
      firstChild &&
      _isDOMElement(vnode) &&
      typeof vnode.type === 'string' &&
      firstChild.tagName.toLowerCase() === vnode.type.toLowerCase()
    ) {
      // Reuse the existing element - it's the same type
      smartUpdateElement(firstChild, vnode as DOMElement);
    } else {
      // Clear and rebuild (first render or structure changed)
      target.textContent = '';

      // Check if this is an element with keyed children even on first render
      if (
        _isDOMElement(vnode) &&
        typeof vnode.type === 'string' &&
        tryFirstRenderKeyedChildren(target, vnode as DOMElement)
      ) {
        return;
      }

      // Default: create whole tree
      const dom = createDOMNode(vnode);
      if (dom) {
        target.appendChild(dom);
      }
    }
  }
}

export function clearDOMRange(context: object): void {
  domRanges.delete(context);
}
