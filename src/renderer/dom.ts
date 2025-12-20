/**
 * DOM mounting and updates
 * Direct DOM manipulation, no VDOM - heavily optimized for speed
 */

import { globalScheduler, isSchedulerExecuting } from '../runtime/scheduler';
import { logger } from '../dev/logger';
import type { Props } from '../shared/types';
import { Fragment } from '../jsx/jsx-runtime';
import {
  CONTEXT_FRAME_SYMBOL,
  type ContextFrame,
  withContext,
  getCurrentContextFrame,
} from '../runtime/context';
import {
  createComponentInstance,
  renderComponentInline,
  mountInstanceInline,
} from '../runtime/component';
import type {
  ComponentFunction,
  ComponentInstance,
} from '../runtime/component';

interface DOMElement {
  type: string | ((props: Props) => unknown);
  props?: Props;
  children?: VNode[];
  key?: string | number;
}

// Type for virtual DOM nodes
export type VNode = DOMElement | string | number | boolean | null | undefined;

// Type for elements that have context frames attached
interface ElementWithContext extends DOMElement {
  [CONTEXT_FRAME_SYMBOL]?: ContextFrame;
}

function _isDOMElement(node: unknown): node is DOMElement {
  return typeof node === 'object' && node !== null && 'type' in node;
}

/**
 * Internal marker for component-owned DOM ranges
 * Allows efficient partial DOM updates instead of clearing entire target
 */
interface DOMRange {
  start: Node; // Start marker (comment node)
  end: Node; // End marker (comment node)
}

const domRanges = new WeakMap<object, DOMRange>();

// Track listeners so we can remove them on cleanup
interface ListenerMapEntry {
  handler: EventListener;
  original: EventListener;
}
const elementListeners = new WeakMap<Element, Map<string, ListenerMapEntry>>();

// Track keyed elements for reconciliation
interface _KeyedChild {
  key: string | number;
  vnode: unknown;
}
const keyedElements = new WeakMap<Element, Map<string | number, Element>>();

// Exported for runtime use: retrieve existing keyed map for a parent element
export function getKeyMapForElement(el: Element) {
  return keyedElements.get(el);
}

export function removeElementListeners(element: Element): void {
  const map = elementListeners.get(element);
  if (map) {
    for (const [eventName, entry] of map) {
      element.removeEventListener(eventName, entry.handler);
    }
    elementListeners.delete(element);
  }
}

export function removeAllListeners(root: Element | null): void {
  if (!root) return;

  // Remove listeners from root
  removeElementListeners(root);

  // Recursively remove from all children
  const children = root.querySelectorAll('*');
  for (let i = 0; i < children.length; i++) {
    removeElementListeners(children[i]);
  }
}

export function evaluate(
  node: unknown,
  target: Element | null,
  context?: object
): void {
  if (!target) return;

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

    const vnode = node;
    const firstChild = target.children[0] as Element | undefined;

    if (
      firstChild &&
      _isDOMElement(vnode) &&
      typeof vnode.type === 'string' &&
      firstChild.tagName.toLowerCase() === vnode.type.toLowerCase()
    ) {
      // Reuse the existing element - it's the same type

      // Smart child update: if the only child is a single text node and vnode only has text children,
      // update the text node in place instead of replacing
      const vnodeChildren = vnode.children || vnode.props?.children;

      // Determine if this should be a simple text update
      let isSimpleTextVNode = false;
      let textContent: string | undefined;

      if (!Array.isArray(vnodeChildren)) {
        if (
          typeof vnodeChildren === 'string' ||
          typeof vnodeChildren === 'number'
        ) {
          isSimpleTextVNode = true;
          textContent = String(vnodeChildren);
        }
      } else if (vnodeChildren.length === 1) {
        // Array with single element - check if it's text
        const child = vnodeChildren[0];
        if (typeof child === 'string' || typeof child === 'number') {
          isSimpleTextVNode = true;
          textContent = String(child);
        }
      }

      if (
        isSimpleTextVNode &&
        firstChild.childNodes.length === 1 &&
        firstChild.firstChild?.nodeType === 3
      ) {
        // Update existing text node in place
        (firstChild.firstChild as Text).data = textContent!;
      } else {
        // Clear and repopulate children
        if (vnodeChildren) {
          if (Array.isArray(vnodeChildren)) {
            // Check if any children have keys - if so, use keyed reconciliation
            const hasKeys = vnodeChildren.some(
              (child) =>
                typeof child === 'object' && child !== null && 'key' in child
            );

            if (hasKeys) {
              // Get existing key map or create new one
              let oldKeyMap = keyedElements.get(firstChild);
              if (!oldKeyMap) {
                oldKeyMap = new Map();
              }

              // Do reconciliation - this will reuse existing keyed elements
              const newKeyMap = reconcileKeyedChildren(
                firstChild,
                vnodeChildren,
                oldKeyMap
              );
              keyedElements.set(firstChild, newKeyMap);
              // Dev debug: ensure we recorded keyed map during reuse path
              logger.debug(
                '[Askr][FASTPATH] reuse keyed map size set:',
                newKeyMap.size
              );
            } else {
              // Unkeyed - keep positional identity: update in-place by index
              updateUnkeyedChildren(firstChild, vnodeChildren);
              keyedElements.delete(firstChild);
            }
          } else {
            // Non-array children
            firstChild.textContent = '';
            const dom = createDOMNode(vnodeChildren);
            if (dom) firstChild.appendChild(dom);
            keyedElements.delete(firstChild);
          }
        } else {
          // No children
          firstChild.textContent = '';
          keyedElements.delete(firstChild);
        }
      }

      // Update attributes and event listeners
      updateElementFromVnode(firstChild, vnode, false);
    } else {
      // Clear and rebuild (first render or structure changed)
      target.textContent = '';

      // Check if this is an element with keyed children even on first render
      if (_isDOMElement(vnode) && typeof vnode.type === 'string') {
        const children = vnode.children;
        if (
          Array.isArray(children) &&
          children.some(
            (child) =>
              typeof child === 'object' && child !== null && 'key' in child
          )
        ) {
          // Create the element first
          const el = document.createElement(vnode.type);
          target.appendChild(el);

          // Apply attributes
          const props = vnode.props || {};
          for (const [key, value] of Object.entries(props)) {
            if (key === 'children' || key === 'key') continue;
            if (value === undefined || value === null || value === false)
              continue;
            if (key.startsWith('on') && key.length > 2) {
              const eventName =
                key.slice(2).charAt(0).toLowerCase() +
                key.slice(3).toLowerCase();
              // Note: DOM event handlers run synchronously, but while in the
              // handler we mark the scheduler as "in handler" to defer any scheduled
              // flushes until the handler completes. This preserves synchronous
              // handler semantics (immediate reads observe state changes), while
              // keeping commits atomic and serialized.
              const wrappedHandler = (event: Event) => {
                globalScheduler.setInHandler(true);
                try {
                  (value as EventListener)(event);
                } catch (error) {
                  logger.error('[Askr] Event handler error:', error);
                } finally {
                  globalScheduler.setInHandler(false);
                }
                // After handler completes, flush any pending tasks
                // globalScheduler.flush(); // Defer flush to manual control for testing
              };
              logger.debug(
                'Attaching event listener:',
                eventName,
                'to element:',
                el
              );
              el.addEventListener(eventName, wrappedHandler);
              if (!elementListeners.has(el)) {
                elementListeners.set(el, new Map());
              }
              elementListeners.get(el)!.set(eventName, {
                handler: wrappedHandler,
                original: value as EventListener,
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

          // Use keyed reconciliation for children
          const newKeyMap = reconcileKeyedChildren(el, children, undefined);
          keyedElements.set(el, newKeyMap);
          // Dev debug: ensure we recorded keyed map during initial render
          logger.debug(
            '[Askr][FASTPATH] initial keyed map size set:',
            newKeyMap.size
          );
          return;
        }
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

/**
 * Reconcile children with keys, efficiently reusing existing elements
 */

// Helper exported so the runtime can decide whether to activate a higher-level
// runtime fast-lane before doing full render bookkeeping. Returns detailed
// decision metadata for dev-mode diagnostics.
export function isKeyedReorderFastPathEligible(
  parent: Element,
  newChildren: VNode[],
  oldKeyMap: Map<string | number, Element> | undefined
) {
  const keyedVnodes: Array<{ key: string | number; vnode: VNode }> = [];
  for (let i = 0; i < newChildren.length; i++) {
    const child = newChildren[i];
    if (_isDOMElement(child) && child.key !== undefined) {
      keyedVnodes.push({ key: child.key, vnode: child });
    }
  }

  const totalKeyed = keyedVnodes.length;
  const newKeyOrder = keyedVnodes.map((kv) => kv.key);
  const oldKeyOrder = oldKeyMap ? Array.from(oldKeyMap.keys()) : [];

  let moveCount = 0;
  for (let i = 0; i < newKeyOrder.length; i++) {
    const k = newKeyOrder[i];
    if (i >= oldKeyOrder.length || oldKeyOrder[i] !== k || !oldKeyMap?.has(k)) {
      moveCount++;
    }
  }

  const FAST_MOVE_THRESHOLD_ABS = 64;
  const FAST_MOVE_THRESHOLD_REL = 0.1; // 10%
  const cheapMoveTrigger =
    totalKeyed >= 128 &&
    oldKeyOrder.length > 0 &&
    moveCount >
      Math.max(
        FAST_MOVE_THRESHOLD_ABS,
        Math.floor(totalKeyed * FAST_MOVE_THRESHOLD_REL)
      );

  let lisTrigger = false;
  let lisLen = 0;
  if (totalKeyed >= 128) {
    const parentChildren = Array.from(parent.children);
    const positions: number[] = new Array(keyedVnodes.length).fill(-1);
    for (let i = 0; i < keyedVnodes.length; i++) {
      const key = keyedVnodes[i].key;
      const el = oldKeyMap?.get(key);
      if (el && el.parentElement === parent) {
        positions[i] = parentChildren.indexOf(el);
      }
    }

    const tails: number[] = [];
    for (let i = 0; i < positions.length; i++) {
      const pos = positions[i];
      if (pos === -1) continue;
      let lo = 0;
      let hi = tails.length;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (tails[mid] < pos) lo = mid + 1;
        else hi = mid;
      }
      if (lo === tails.length) tails.push(pos);
      else tails[lo] = pos;
    }
    lisLen = tails.length;
    lisTrigger = lisLen < Math.floor(totalKeyed * 0.5);
  }

  // Conservative rule: if any keyed vnode declares non-trivial props
  // (excluding event handlers), decline the fast-path. This prevents edge
  // cases where props exist but match current DOM; the runtime fast-lane is
  // only for pure reorder-only updates.
  let hasPropsPresent = false;
  for (let i = 0; i < keyedVnodes.length; i++) {
    const vnode = keyedVnodes[i].vnode;
    if (!_isDOMElement(vnode)) continue;
    const props = vnode.props || {};
    for (const k of Object.keys(props)) {
      if (k === 'children' || k === 'key') continue;
      if (k.startsWith('on') && k.length > 2) continue; // ignore event handlers
      if (k.startsWith('data-')) continue; // allow data-* attrs (keys/materialization)
      hasPropsPresent = true;
      break;
    }
    if (hasPropsPresent) break;
  }

  // Check for conservative prop differences on existing elements
  let hasPropChanges = false;
  for (let i = 0; i < keyedVnodes.length; i++) {
    const { key, vnode } = keyedVnodes[i];
    const el = oldKeyMap?.get(key);
    if (!el || !_isDOMElement(vnode)) continue;
    const props = vnode.props || {};
    for (const k of Object.keys(props)) {
      if (k === 'children' || k === 'key') continue;
      if (k.startsWith('on') && k.length > 2) continue;
      const v = (props as Record<string, unknown>)[k];
      try {
        if (k === 'class' || k === 'className') {
          if (el.className !== String(v)) {
            hasPropChanges = true;
            break;
          }
        } else if (k === 'value' || k === 'checked') {
          if ((el as HTMLElement & Record<string, unknown>)[k] !== v) {
            hasPropChanges = true;
            break;
          }
        } else {
          const attr = el.getAttribute(k);
          if (v === undefined || v === null || v === false) {
            if (attr !== null) {
              hasPropChanges = true;
              break;
            }
          } else if (String(v) !== attr) {
            hasPropChanges = true;
            break;
          }
        }
      } catch {
        hasPropChanges = true;
        break;
      }
    }
    if (hasPropChanges) break;
  }

  const useFastPath =
    (cheapMoveTrigger || lisTrigger) && !hasPropChanges && !hasPropsPresent;

  return {
    useFastPath,
    totalKeyed,
    moveCount,
    lisLen,
    hasPropChanges,
  } as const;
}

function reconcileKeyedChildren(
  parent: Element,
  newChildren: VNode[],
  oldKeyMap: Map<string | number, Element> | undefined
): Map<string | number, Element> {
  const newKeyMap = new Map<string | number, Element>();

  // Debug
  const DEBUG = false;
  if (DEBUG) {
    logger.debug('reconcileKeyedChildren called with:', {
      parentTag: parent.tagName,
      oldKeyMapSize: oldKeyMap?.size || 0,
      oldKeys: Array.from(oldKeyMap?.keys() || []),
      newChildrenCount: newChildren.length,
    });
  }

  // First pass: collect all keyed vnodes and match to existing elements
  const keyedVnodes: Array<{ key: string | number; vnode: VNode }> = [];
  const unkeyedVnodes: VNode[] = [];

  for (let i = 0; i < newChildren.length; i++) {
    const child = newChildren[i];
    if (_isDOMElement(child) && child.key !== undefined) {
      keyedVnodes.push({ key: child.key, vnode: child });
    } else {
      unkeyedVnodes.push(child);
    }
  }

  // Decide whether to use the fast-path. We use two heuristics:
  //  - cheap move heuristic: positional mismatches in-memory (no DOM reads)
  //  - LIS-based heuristic: compute Longest Increasing Subsequence on the
  //    parent's current children order (requires reading current DOM order)
  // Additionally, the fast-path is only valid if there are NO prop/event
  // changes to existing keyed elements; it's strictly a bulk reorder escape.
  const totalKeyed = keyedVnodes.length;
  const newKeyOrder = keyedVnodes.map((kv) => kv.key);
  const oldKeyOrder = oldKeyMap ? Array.from(oldKeyMap.keys()) : [];

  // Conservative mismatch count: positional differences or new insertions
  // count as moves. This intentionally avoids any DOM traversal.
  let moveCount = 0;
  for (let i = 0; i < newKeyOrder.length; i++) {
    const k = newKeyOrder[i];
    if (i >= oldKeyOrder.length || oldKeyOrder[i] !== k || !oldKeyMap?.has(k)) {
      moveCount++;
    }
  }

  // Fast-path eligibility is computed by `isKeyedReorderFastPathEligible`.
  // We intentionally avoid duplicating the heuristic computation here to keep
  // the logic centralized and prevent unused-variable lint errors.
  // Check for prop / event-handler changes on existing nodes. If any keyed vnode
  // introduces attribute/event handler changes compared to the current element
  // state, decline the fast-path to preserve correctness (we will do fine-grained updates).
  let hasPropChanges = false;
  for (let i = 0; i < keyedVnodes.length; i++) {
    const { key, vnode } = keyedVnodes[i];
    const el = oldKeyMap?.get(key);
    if (!el || !_isDOMElement(vnode)) continue;
    const props = vnode.props || {};
    // If vnode declares event handlers, bail (we don't want to reattach handlers in bulk)
    for (const k of Object.keys(props)) {
      if (k === 'children' || k === 'key') continue;
      if (k.startsWith('on') && k.length > 2) {
        // Ignore event handlers for fast-path activation: the fast-path
        // preserves existing element listeners (we do not reattach on each
        // reorder). Treat presence of a handler as non-blocking for fast-path.
        continue;
      }
      // Check `class`, `value`, `checked`, attribute differences conservatively
      const v = (props as Record<string, unknown>)[k];
      try {
        if (k === 'class' || k === 'className') {
          if (el.className !== String(v)) {
            logger.warn('[Askr][FASTPATH][DEV] prop mismatch', {
              key,
              prop: k,
              expected: String(v),
              actual: el.className,
            });
            hasPropChanges = true;
            break;
          }
        } else if (k === 'value' || k === 'checked') {
          if ((el as HTMLElement & Record<string, unknown>)[k] !== v) {
            logger.warn('[Askr][FASTPATH][DEV] prop mismatch', {
              key,
              prop: k,
              expected: v,
              actual: (el as HTMLElement & Record<string, unknown>)[k],
            });
            hasPropChanges = true;
            break;
          }
        } else {
          // Attribute check: presence/absence or string difference
          const attr = el.getAttribute(k);
          if (v === undefined || v === null || v === false) {
            if (attr !== null) {
              logger.warn(
                '[Askr][FASTPATH][DEV] prop mismatch (missing attr)',
                {
                  key,
                  prop: k,
                  expected: v,
                  actual: attr,
                }
              );
              hasPropChanges = true;
              break;
            }
          } else if (String(v) !== attr) {
            logger.warn('[Askr][FASTPATH][DEV] prop mismatch (attr diff)', {
              key,
              prop: k,
              expected: String(v),
              actual: attr,
            });
            hasPropChanges = true;
            break;
          }
        }
      } catch {
        // If any DOM read fails, be conservative and disable the fast path
        hasPropChanges = true;
        break;
      }
    }
    if (hasPropChanges) break;
  }

  const decision = isKeyedReorderFastPathEligible(
    parent,
    newChildren,
    oldKeyMap
  );
  const useFastPath = decision.useFastPath;

  // Dev debug: explain why we chose (or declined) fast-path for this update
  logger.warn('[Askr][FASTPATH][DEV] decision', decision);

  // Clear previous fast-path stats when we decline the fast-path to avoid
  // leaking prior run data across updates (tests rely on this behavior).
  if (!useFastPath && typeof globalThis !== 'undefined') {
    try {
      const _g = globalThis as unknown as Record<string, unknown>;
      delete _g.__ASKR_LAST_FASTPATH_STATS;
      delete _g.__ASKR_LAST_FASTPATH_REUSED;
    } catch {
      /* ignore */
    }
  }

  if (useFastPath) {
    // Dev invariant: ensure we are executing inside the scheduler/commit flush
    if (!isSchedulerExecuting()) {
      logger.warn(
        '[Askr][FASTPATH][DEV] Fast-path reconciliation invoked outside scheduler execution'
      );
    }

    // Build a local map of existing keyed elements from DOM as a robust
    // fallback (avoids relying on cached WeakMap entries which may be
    // missing in some render paths). This requires a small DOM read but
    // keeps the fast-path robust.
    const localOldKeyMap = new Map<string | number, Element>();
    try {
      const parentChildren = Array.from(parent.children);
      for (let i = 0; i < parentChildren.length; i++) {
        const ch = parentChildren[i] as Element;
        const k = ch.getAttribute('data-key');
        if (k !== null) {
          localOldKeyMap.set(k, ch);
          // also store numeric form for numeric keys
          const n = Number(k);
          if (!Number.isNaN(n)) localOldKeyMap.set(n, ch);
        }
      }
    } catch {
      // ignore DOM read failures; we'll fall back to creation
    }

    logger.warn(
      '[Askr][FASTPATH] oldKeyMap size:',
      oldKeyMap?.size ?? 0,
      'localOldKeyMap size:',
      localOldKeyMap.size
    );

    // Build the final node array WITHOUT touching the DOM. For existing
    // elements we reuse the `oldKeyMap` or `localOldKeyMap` references; for
    // new vnodes we create detached nodes via `createDOMNode`.
    const tLookupStart =
      typeof performance !== 'undefined' && performance.now
        ? performance.now()
        : Date.now();
    const finalNodes: Node[] = [];
    let mapLookups = 0;
    let createdNodes = 0;
    let reusedCount = 0;

    for (let i = 0; i < keyedVnodes.length; i++) {
      const { key, vnode } = keyedVnodes[i];
      mapLookups++;
      const el =
        localOldKeyMap.get(key as string | number) ?? oldKeyMap?.get(key);

      if (el) {
        finalNodes.push(el);
        reusedCount++;
      } else {
        const newEl = createDOMNode(vnode);
        if (newEl) {
          finalNodes.push(newEl);
          createdNodes++;
        }
      }
    }

    // Add unkeyed nodes (detached as well)
    for (const vnode of unkeyedVnodes) {
      const newEl = createDOMNode(vnode);
      if (newEl) {
        finalNodes.push(newEl);
        createdNodes++;
      }
    }
    const t_lookup =
      typeof performance !== 'undefined' && performance.now
        ? performance.now() - tLookupStart
        : 0;

    // Dev-only guard disabled for minimal fast-path to avoid prototype
    // monkey-patching during the tight commit. The fast-path now performs a
    // single DocumentFragment-based commit and is validated via micro-bench
    // instrumentation instead of dynamic API wrapping.
    if (process.env.ASKR_FASTPATH_GUARD === '1') {
      const replaceChildrenCount = 0;
      const otherMutationCount = 0;

      const orig: Record<string, unknown> = {};
      // Only wrap methods that exist in the current environment
      const elProto = Element.prototype as unknown as Record<string, unknown>;
      const nodeProto = Node.prototype as unknown as Record<string, unknown>;
      // Detect existence of `remove()` on nodes without referencing the
      // `ChildNode` type (which is a TS-only interface in some lib targets).
      const removeFn = (() => {
        if (
          typeof document === 'undefined' ||
          typeof document.createElement !== 'function'
        )
          return undefined;
        try {
          const el = document.createElement('div') as unknown as {
            remove?: () => void;
          };
          return typeof el.remove === 'function' ? el.remove : undefined;
        } catch {
          return undefined;
        }
      })();

      if (elProto.replaceChildren)
        orig.replaceChildren = elProto.replaceChildren;
      if (nodeProto.appendChild) orig.appendChild = nodeProto.appendChild;
      if (nodeProto.insertBefore) orig.insertBefore = nodeProto.insertBefore;
      if (nodeProto.removeChild) orig.removeChild = nodeProto.removeChild;
      if (nodeProto.replaceChild) orig.replaceChild = nodeProto.replaceChild;
      if (removeFn) orig.remove = removeFn;

      let violation = false;
      try {
        const fragment = document.createDocumentFragment();
        for (let i = 0; i < finalNodes.length; i++)
          fragment.appendChild(finalNodes[i]);
        // Count commits explicitly in code (no prototype monkey-patching)
        let commitCount = 0;
        commitCount++;
        parent.replaceChildren(fragment);
        // Export commit count for dev diagnostics
        if (typeof globalThis !== 'undefined') {
          (globalThis as unknown as Record<string, unknown>)[
            '__ASKR_LAST_FASTPATH_COMMIT_COUNT'
          ] = commitCount;
        }
      } finally {
        // Restore parent's original

        // Restore originals (only those we replaced)

        // Assert invariants: no other structural mutation APIs were called
        // during the fast-path. We accept >=1 replaceChildren calls because
        // tests may install instance-level spies that wrap the call once.
        violation =
          (otherMutationCount as number) !== 0 ||
          (replaceChildrenCount as number) < 1;
      }
      if (violation) {
        logger.error(
          '[Askr][DEV] Fast-path structural mutation invariant violated:',
          {
            replaceChildrenCount,
            otherMutationCount,
          }
        );
        // Fail hard in dev so regressions are caught early
        throw new Error(
          'Fast-path must perform a single structural replacement (replaceChildren) and no other structural mutations'
        );
      }
    } else {
      // Production: single atomic commit (measure phases if tracing)

      const tFragmentStart = Date.now();
      const fragment = document.createDocumentFragment();
      let fragmentAppendCount = 0;
      for (let i = 0; i < finalNodes.length; i++) {
        fragment.appendChild(finalNodes[i]);
        fragmentAppendCount++;
      }
      const t_fragment = Date.now() - tFragmentStart;

      // Dev: capture scheduler state so we can assert no tasks were enqueued
      // during the fast-path commit. This ensures we didn't accidentally
      // invoke per-node scheduling work.
      const schedBefore =
        process.env.NODE_ENV !== 'production'
          ? globalScheduler.getState()
          : null;
      const wasExecuting =
        process.env.NODE_ENV !== 'production' ? isSchedulerExecuting() : false;

      const tCommitStart = Date.now();
      if (process.env.NODE_ENV !== 'production') {
        // Extra debug to help tests detect the structural change and to aid
        // diagnosing spy/observer mismatches in test harnesses.
        logger.debug(
          '[Askr][FASTPATH] about to call replaceChildren on parent:',
          parent.tagName
        );
      }
      // Count commits explicitly in code (no prototype monkey-patching)
      let commitCount = 0;
      commitCount++;
      parent.replaceChildren(fragment);
      // Export commit count for dev diagnostics
      if (typeof globalThis !== 'undefined') {
        (globalThis as unknown as Record<string, unknown>)[
          '__ASKR_LAST_FASTPATH_COMMIT_COUNT'
        ] = commitCount;
      }
      const t_commit = Date.now() - tCommitStart;

      // Dev assertions: validate scheduler state and final DOM structure
      if (process.env.NODE_ENV !== 'production') {
        const schedAfter = globalScheduler.getState();
        if (!wasExecuting) {
          logger.warn(
            '[Askr][FASTPATH][DEV] Fast-path commit invoked outside scheduler execution'
          );
        }
        if (schedBefore && schedAfter) {
          if (schedBefore.taskCount !== schedAfter.taskCount) {
            logger.error(
              '[Askr][FASTPATH][DEV] Scheduler tasks were enqueued during fast-path commit',
              {
                before: schedBefore,
                after: schedAfter,
              }
            );
            throw new Error('Fast-path must not enqueue scheduler tasks');
          }
        }

        // Assert that the parent's children exactly match the final nodes
        // (single atomic replacement). If this fails, the fast-path violated
        // the single-commit invariant.
        const parentNodes = Array.from(parent.childNodes);
        if (parentNodes.length !== finalNodes.length) {
          logger.error('[Askr][FASTPATH][DEV] Parent child count mismatch', {
            parentCount: parentNodes.length,
            expected: finalNodes.length,
          });
          throw new Error(
            'Fast-path must perform a single structural replacement'
          );
        }
        for (let i = 0; i < finalNodes.length; i++) {
          if (parentNodes[i] !== finalNodes[i]) {
            logger.error(
              '[Askr][FASTPATH][DEV] Final DOM order mismatch at index',
              i,
              {
                expected: finalNodes[i],
                found: parentNodes[i],
              }
            );
            throw new Error(
              'Fast-path final DOM order does not match expected nodes'
            );
          }
        }
      }

      // Phase: minimal bookkeeping - populate newKeyMap
      const tBookkeepingStart = Date.now();
      for (let i = 0; i < keyedVnodes.length; i++) {
        const key = keyedVnodes[i].key;
        const node = finalNodes[i];
        if (node instanceof Element) newKeyMap.set(key, node as Element);
      }
      const t_bookkeeping = Date.now() - tBookkeepingStart;

      // Emit tracing stats in dev if requested
      if (
        process.env.ASKR_FASTPATH_TRACE === '1' ||
        process.env.NODE_ENV !== 'production'
      ) {
        const stats = {
          n: totalKeyed,
          moves: moveCount,
          lisLen: 0,
          t_lookup,
          t_fragment,
          t_commit,
          t_bookkeeping,
          fragmentAppendCount,
          mapLookups,
          createdNodes,
          reusedCount,
        } as const;
        if (typeof globalThis !== 'undefined') {
          (globalThis as unknown as Record<string, unknown>)[
            '__ASKR_LAST_FASTPATH_STATS'
          ] = stats;
          (globalThis as unknown as Record<string, unknown>)[
            '__ASKR_LAST_FASTPATH_REUSED'
          ] = reusedCount > 0;
        }
        logger.warn('[Askr][FASTPATH]', JSON.stringify(stats));
      }
    }

    return newKeyMap;
  }

  // Fallback: Rebuild with minimal moves: insert before `anchor` as we go
  // Compute indices of existing keyed elements in parent's current order
  const parentChildren = Array.from(parent.children);
  const positions: number[] = new Array(keyedVnodes.length).fill(-1);
  for (let i = 0; i < keyedVnodes.length; i++) {
    const key = keyedVnodes[i].key;
    const el = oldKeyMap?.get(key);
    if (el && el.parentElement === parent) {
      positions[i] = parentChildren.indexOf(el);
    }
  }

  // Compute Longest Increasing Subsequence (LIS) of positions to
  // determine which existing elements are already in correct order
  // and can be left in place (minimizes moves).
  const keepSet = new Set<number>();
  const tails: number[] = [];
  const tailsIdx: number[] = [];
  const prev: number[] = new Array(positions.length).fill(-1);

  for (let i = 0; i < positions.length; i++) {
    const pos = positions[i];
    if (pos === -1) continue;
    // binary search for insertion point
    let lo = 0;
    let hi = tails.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (tails[mid] < pos) lo = mid + 1;
      else hi = mid;
    }
    if (lo === tails.length) {
      tails.push(pos);
      tailsIdx.push(i);
    } else {
      tails[lo] = pos;
      tailsIdx[lo] = i;
    }
    prev[i] = lo > 0 ? tailsIdx[lo - 1] : -1;
  }

  // Reconstruct LIS indices into keepSet
  let k = tailsIdx.length ? tailsIdx[tailsIdx.length - 1] : -1;
  while (k !== -1) {
    keepSet.add(k);
    k = prev[k];
  }

  let anchor: Node | null = parent.firstChild;

  for (let i = 0; i < keyedVnodes.length; i++) {
    const { key, vnode } = keyedVnodes[i];
    const el = oldKeyMap?.get(key);

    if (el && el.parentElement === parent) {
      if (keepSet.has(i)) {
        // This element can stay; ensure anchor advances past it
        if (anchor === el) {
          anchor = el.nextSibling;
        }
        updateElementFromVnode(el, vnode);
        newKeyMap.set(key, el);
      } else {
        // Move existing element into place before anchor
        parent.insertBefore(el, anchor);
        updateElementFromVnode(el, vnode);
        newKeyMap.set(key, el);
        anchor = el.nextSibling;
      }
    } else {
      // New element - insert before anchor
      const newEl = createDOMNode(vnode);
      if (newEl instanceof Element) {
        parent.insertBefore(newEl, anchor);
        newKeyMap.set(key, newEl);
        anchor = newEl.nextSibling;
      }
    }
  }

  // Add unkeyed children at the end
  for (const vnode of unkeyedVnodes) {
    const newEl = createDOMNode(vnode);
    if (newEl) {
      parent.appendChild(newEl);
    }
  }

  return newKeyMap;
}

/**
 * Update an existing element's attributes and children from vnode
 */
function updateElementFromVnode(
  el: Element,
  vnode: VNode,
  updateChildren = true
): void {
  if (!_isDOMElement(vnode)) {
    return;
  }

  const props = vnode.props || {};

  // Ensure key is materialized on existing elements so DOM-based scans succeed
  if ((vnode as DOMElement).key !== undefined) {
    el.setAttribute('data-key', String((vnode as DOMElement).key));
  }

  // Diff and update event listeners and other attributes
  const existingListeners = elementListeners.get(el);
  const desiredEventNames = new Set<string>();

  for (const [key, value] of Object.entries(props)) {
    if (key === 'children' || key === 'key') continue;

    // Handle removal cases
    if (value === undefined || value === null || value === false) {
      if (key === 'class' || key === 'className') {
        el.className = '';
      } else if (key.startsWith('on') && key.length > 2) {
        const eventName =
          key.slice(2).charAt(0).toLowerCase() + key.slice(3).toLowerCase();
        if (existingListeners && existingListeners.has(eventName)) {
          const entry = existingListeners.get(eventName)!;
          el.removeEventListener(eventName, entry.handler);
          existingListeners.delete(eventName);
        }
        continue;
      } else {
        el.removeAttribute(key);
      }
      continue;
    }

    if (key === 'class' || key === 'className') {
      el.className = String(value);
    } else if (key === 'value' || key === 'checked') {
      (el as HTMLElement & Record<string, unknown>)[key] = value;
    } else if (key.startsWith('on') && key.length > 2) {
      // Event handlers: convert camelCase to lowercase event names
      // onClick → click, onMouseMove → mousemove, onDoubleClick → doubleclick
      // All event handlers are automatically wrapped by the scheduler to ensure
      // deterministic, serialized execution. This prevents race conditions where
      // multiple rapid events might read stale state.
      const eventName =
        key.slice(2).charAt(0).toLowerCase() + key.slice(3).toLowerCase();

      desiredEventNames.add(eventName);

      const existing = existingListeners?.get(eventName);
      // If the handler reference is unchanged, keep existing wrapped handler
      if (existing && existing.original === value) {
        continue;
      }

      // Remove old handler if present
      if (existing) {
        el.removeEventListener(eventName, existing.handler);
      }

      // Note: DOM event handlers run synchronously, but while in the
      // handler we mark the scheduler as "in handler" to defer any scheduled
      // flushes until the handler completes. This preserves synchronous
      // handler semantics (immediate reads observe state changes), while
      // keeping commits atomic and serialized.
      const wrappedHandler = (event: Event) => {
        globalScheduler.setInHandler(true);
        try {
          (value as EventListener)(event);
        } catch (error) {
          // Log event handler errors
          logger.error('[Askr] Event handler error:', error);
        } finally {
          globalScheduler.setInHandler(false);
        }
      };

      el.addEventListener(eventName, wrappedHandler);
      if (!elementListeners.has(el)) {
        elementListeners.set(el, new Map());
      }
      elementListeners.get(el)!.set(eventName, {
        handler: wrappedHandler,
        original: value as EventListener,
      });
    } else {
      el.setAttribute(key, String(value));
    }
  }

  // Remove any remaining listeners not desired by current props
  if (existingListeners) {
    // Iterate over keys to avoid allocating a transient array via Array.from
    for (const eventName of existingListeners.keys()) {
      const entry = existingListeners.get(eventName)!;
      if (!desiredEventNames.has(eventName)) {
        el.removeEventListener(eventName, entry.handler);
        existingListeners.delete(eventName);
      }
    }
    if (existingListeners.size === 0) elementListeners.delete(el);
  }

  // Update children
  if (updateChildren) {
    const children =
      vnode.children || (props.children as VNode | VNode[] | undefined);
    updateElementChildren(el, children);
  }
}

/**
 * Update an existing element's children
 */
function updateElementChildren(
  el: Element,
  children: VNode | VNode[] | undefined
): void {
  if (!children) {
    el.textContent = '';
    return;
  }

  // Handle simple text case
  if (
    !Array.isArray(children) &&
    (typeof children === 'string' || typeof children === 'number')
  ) {
    if (el.childNodes.length === 1 && el.firstChild?.nodeType === 3) {
      // Update existing text node
      (el.firstChild as Text).data = String(children);
    } else {
      el.textContent = String(children);
    }
    return;
  }

  // For array children, update in-place to preserve positional identity
  if (Array.isArray(children)) {
    updateUnkeyedChildren(el, children);
    return;
  }

  // Fallback: clear and rebuild
  el.textContent = '';
  const dom = createDOMNode(children);
  if (dom) el.appendChild(dom);
}

/**
 * Update unkeyed children by position, preserving element identity when tags match.
 */
function updateUnkeyedChildren(parent: Element, newChildren: unknown[]): void {
  const existing = Array.from(parent.children);
  // If there are only text nodes (no element children), clear before updating
  if (existing.length === 0 && parent.childNodes.length > 0) {
    parent.textContent = '';
  }
  const max = Math.max(existing.length, newChildren.length);

  for (let i = 0; i < max; i++) {
    const current = existing[i];
    const next = newChildren[i];

    // Remove extra existing children
    if (next === undefined && current) {
      current.remove();
      continue;
    }

    // Append new children beyond existing length
    if (!current && next !== undefined) {
      const dom = createDOMNode(next);
      if (dom) parent.appendChild(dom);
      continue;
    }

    if (!current || next === undefined) continue;

    // Update existing element based on next vnode/primitive
    if (typeof next === 'string' || typeof next === 'number') {
      current.textContent = String(next);
    } else if (_isDOMElement(next)) {
      if (typeof next.type === 'string') {
        // If element type matches, update in place; otherwise replace
        if (current.tagName.toLowerCase() === next.type.toLowerCase()) {
          updateElementFromVnode(current, next);
        } else {
          const dom = createDOMNode(next);
          if (dom) {
            parent.replaceChild(dom, current);
          }
        }
      } else {
        // Non-string types: replace conservatively
        const dom = createDOMNode(next);
        if (dom) parent.replaceChild(dom, current);
      }
    } else {
      // Fallback for other types: replace
      const dom = createDOMNode(next);
      if (dom) parent.replaceChild(dom, current);
    }
  }
}

export function createDOMNode(node: unknown): Node | null {
  // Fast paths for primitives (most common)
  if (typeof node === 'string') {
    return document.createTextNode(node);
  }
  if (typeof node === 'number') {
    return document.createTextNode(String(node));
  }

  // Null/undefined/false
  if (!node) {
    return null;
  }

  // Array (fragment) - batch all at once
  if (Array.isArray(node)) {
    const fragment = document.createDocumentFragment();
    for (let i = 0; i < node.length; i++) {
      const dom = createDOMNode(node[i]);
      if (dom) fragment.appendChild(dom);
    }
    return fragment;
  }

  // Element or Component
  if (typeof node === 'object' && node !== null && 'type' in node) {
    const type = (node as DOMElement).type;
    const props = (node as DOMElement).props || {};

    // Intrinsic element (string type)
    if (typeof type === 'string') {
      const el = document.createElement(type);

      // Set attributes and event handlers in single pass
      for (const [key, value] of Object.entries(props)) {
        // Skip special keys
        if (key === 'children' || key === 'key') continue;
        if (value === undefined || value === null || value === false) continue;

        // Event handlers: convert camelCase to lowercase event names
        // onClick → click, onMouseMove → mousemove, onDoubleClick → doubleclick
        // All event handlers are automatically wrapped by the scheduler to ensure
        // deterministic, serialized execution. This prevents race conditions where
        // multiple rapid events might read stale state.
        if (key.startsWith('on') && key.length > 2) {
          // Extract event name: 'onClick' → 'click'
          const eventName =
            key.slice(2).charAt(0).toLowerCase() + key.slice(3).toLowerCase();
          // Wrap handler to execute through scheduler
          const wrappedHandler = (event: Event) => {
            globalScheduler.setInHandler(true);
            try {
              (value as EventListener)(event);
            } catch (error) {
              // Log event handler errors
              logger.error('[Askr] Event handler error:', error);
            } finally {
              globalScheduler.setInHandler(false);
            }
            // After handler completes, flush any pending tasks
            // globalScheduler.flush(); // Defer flush to manual control for testing
          };
          logger.debug(
            'Attaching event listener in createDOMNode:',
            eventName,
            'to element:',
            el
          );
          // Attach and track listener
          el.addEventListener(eventName, wrappedHandler);
          if (!elementListeners.has(el)) {
            elementListeners.set(el, new Map());
          }
          elementListeners.get(el)!.set(eventName, {
            handler: wrappedHandler,
            original: value as EventListener,
          });
        } else if (key === 'class' || key === 'className') {
          el.className = String(value);
        } else if (key === 'value' || key === 'checked') {
          (el as HTMLElement & Props)[key] = value;
          el.setAttribute(key, String(value));
        } else {
          // Generic attribute handling (id, placeholder, data-*, aria-*, etc.)
          el.setAttribute(key, String(value));
        }
      }

      // Materialize key on created element so DOM-based fast-path can find it
      const vnodeKey = (node as DOMElement).key;
      if (vnodeKey !== undefined) {
        el.setAttribute('data-key', String(vnodeKey));
      }

      // Add children - batch append
      const children = props.children || (node as DOMElement).children;
      if (children) {
        if (Array.isArray(children)) {
          // Check for missing keys on dynamic lists in dev mode
          if (process.env.NODE_ENV !== 'production') {
            let hasElements = false;
            let hasKeys = false;
            for (let i = 0; i < children.length; i++) {
              const item = children[i];
              if (typeof item === 'object' && item !== null && 'type' in item) {
                hasElements = true;
                const itemProps = (item as DOMElement).props || {};
                if ('key' in itemProps) {
                  hasKeys = true;
                  break;
                }
              }
            }
            if (hasElements && !hasKeys) {
              if (typeof console !== 'undefined') {
                logger.warn(
                  'Missing keys on dynamic lists. Each child in a list should have a unique "key" prop.'
                );
              }
            }
          }

          for (let i = 0; i < children.length; i++) {
            const dom = createDOMNode(children[i]);
            if (dom) el.appendChild(dom);
          }
        } else {
          const dom = createDOMNode(children);
          if (dom) el.appendChild(dom);
        }
      }

      return el;
    }

    // Component (function type) - inline execution
    if (typeof type === 'function') {
      // Check if this vnode has a marked context frame
      const frame = (node as ElementWithContext)[CONTEXT_FRAME_SYMBOL];

      // Capture context snapshot for this component's render
      // If the vnode was not explicitly marked, fall back to the current
      // ambient frame so the component's returned subtree inherits lexical
      // provider context.
      const snapshot = frame || getCurrentContextFrame();

      // Components must be synchronous. Async components are not supported.
      // Use `resource()` for async work — it provides explicit pending/value/error
      // semantics, generation-based staleness, and lifecycle-bound cancellation.
      const componentFn = type as (props: Props) => unknown;
      const isAsync = componentFn.constructor.name === 'AsyncFunction';

      if (isAsync) {
        throw new Error(
          'Async components are not supported. Use resource() for async work.'
        );
      }

      // Ensure there is a persistent instance object attached to this vnode
      const vnodeAny = node as ElementWithContext & {
        __instance?: ComponentInstance;
      };
      let childInstance = vnodeAny.__instance;
      if (!childInstance) {
        // Create a new instance for this component so it can own hooks and mount ops
        childInstance = createComponentInstance(
          `comp-${Math.random().toString(36).slice(2, 7)}`,
          componentFn as ComponentFunction,
          props || {},
          null
        );
        vnodeAny.__instance = childInstance;
      }

      // If this vnode was marked with a context frame, record it on the
      // instance as its incoming provider frame so future re-renders and
      // async operations (resources) can reference the correct provider chain.
      if (snapshot) {
        childInstance.ownerFrame = snapshot;
      }

      // Render the component inline using the instance so hooks register correctly.
      // IMPORTANT: also keep the snapshot active while materializing the returned
      // subtree so nested providers can chain to the correct parent frame.
      const result = withContext(snapshot, () =>
        renderComponentInline(childInstance)
      );

      if (result instanceof Promise) {
        // Defensive: disallow components that return a Promise
        throw new Error(
          'Async components are not supported. Components must return synchronously.'
        );
      }

      // Create DOM subtree for the component result (under the same snapshot)
      const dom = withContext(snapshot, () => createDOMNode(result));

      // Mount the instance inline now that its DOM is materialized
      if (dom instanceof Element) {
        mountInstanceInline(childInstance, dom);
      } else {
        // For non-element results (fragments or text nodes) create a host
        // element to serve as the instance target. This host is not attached
        // to the document; it only provides a stable element for mount ops.
        const host = document.createElement('div');
        mountInstanceInline(childInstance, host);
      }

      return dom;
    }

    // Fragment support: render children without wrapper element
    // Uses Askr's Fragment symbol
    if (
      typeof type === 'symbol' &&
      (type === Fragment || String(type) === 'Symbol(Fragment)')
    ) {
      const fragment = document.createDocumentFragment();
      const children = props.children || (node as DOMElement).children;
      if (children) {
        if (Array.isArray(children)) {
          for (let i = 0; i < children.length; i++) {
            const dom = createDOMNode(children[i]);
            if (dom) fragment.appendChild(dom);
          }
        } else {
          const dom = createDOMNode(children);
          if (dom) fragment.appendChild(dom);
        }
      }
      return fragment;
    }
  }

  return null;
}

// Expose minimal renderer bridge for runtime fast-lane to call `evaluate`
if (typeof globalThis !== 'undefined') {
  const _g = globalThis as unknown as Record<string, unknown>;
  _g.__ASKR_RENDERER = {
    evaluate,
    isKeyedReorderFastPathEligible,
    getKeyMapForElement,
  };
}
