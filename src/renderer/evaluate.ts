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
    if (
      _isDOMElement(vnode) &&
      typeof (vnode as DOMElement).type === 'symbol' &&
      ((vnode as DOMElement).type === Fragment ||
        String((vnode as DOMElement).type) === 'Symbol(askr.fragment)')
    ) {
      const fragmentChildren =
        (vnode as DOMElement).props?.children ||
        (vnode as DOMElement).children ||
        [];
      const childArray = Array.isArray(fragmentChildren)
        ? fragmentChildren
        : [fragmentChildren];
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
            // Same element type - do smart update with keyed reconciliation
            const vnodeChildren =
              (childVnode as DOMElement).children ||
              (childVnode as DOMElement).props?.children;

            // Check for simple text update
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
              const child = vnodeChildren[0];
              if (typeof child === 'string' || typeof child === 'number') {
                isSimpleTextVNode = true;
                textContent = String(child);
              }
            }

            if (
              isSimpleTextVNode &&
              existingNode.childNodes.length === 1 &&
              existingNode.firstChild?.nodeType === 3
            ) {
              (existingNode.firstChild as Text).data = textContent!;
            } else if (vnodeChildren) {
              if (Array.isArray(vnodeChildren)) {
                // Check for keyed children
                const hasKeys = vnodeChildren.some(
                  (child) =>
                    typeof child === 'object' &&
                    child !== null &&
                    'key' in child
                );

                if (hasKeys) {
                  // Get or build key map
                  let oldKeyMap = keyedElements.get(existingNode);
                  if (!oldKeyMap) {
                    oldKeyMap = new Map();
                    const children = Array.from(existingNode.children);
                    for (let j = 0; j < children.length; j++) {
                      const ch = children[j] as Element;
                      const k = ch.getAttribute('data-key');
                      if (k !== null) {
                        oldKeyMap.set(k, ch);
                        const n = Number(k);
                        if (!Number.isNaN(n)) oldKeyMap.set(n, ch);
                      }
                    }
                    if (oldKeyMap.size > 0)
                      keyedElements.set(existingNode, oldKeyMap);
                  }
                  // Use keyed reconciliation
                  const newKeyMap = reconcileKeyedChildren(
                    existingNode,
                    vnodeChildren,
                    oldKeyMap
                  );
                  keyedElements.set(existingNode, newKeyMap);
                } else {
                  // Unkeyed children - check for bulk text fast-path
                  if (isBulkTextFastPathEligible(existingNode, vnodeChildren)) {
                    const stats = performBulkTextReplace(
                      existingNode,
                      vnodeChildren
                    );
                    // Dev-only instrumentation counters
                    if (process.env.NODE_ENV !== 'production') {
                      try {
                        __ASKR_set('__LAST_BULK_TEXT_FASTPATH_STATS', stats);
                        __ASKR_incCounter('bulkTextHits');
                      } catch (e) {
                        void e;
                      }
                    }
                  } else {
                    if (process.env.NODE_ENV !== 'production') {
                      try {
                        __ASKR_incCounter('bulkTextMisses');
                      } catch (e) {
                        void e;
                      }
                    }
                    updateUnkeyedChildren(existingNode, vnodeChildren);
                  }
                  keyedElements.delete(existingNode);
                }
              } else {
                existingNode.textContent = '';
                const dom = createDOMNode(vnodeChildren);
                if (dom) existingNode.appendChild(dom);
                keyedElements.delete(existingNode);
              }
            } else {
              existingNode.textContent = '';
              keyedElements.delete(existingNode);
            }

            // Update attributes
            updateElementFromVnode(existingNode, childVnode, false);
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
                // Attempt to populate oldKeyMap from DOM attributes if the
                // keyedElements registry hasn't been initialized yet. This
                // supports cases where initial render or previous updates set
                // `data-key` attributes but the runtime registry was not set.
                oldKeyMap = new Map();
                try {
                  const children = Array.from(firstChild.children);
                  for (let i = 0; i < children.length; i++) {
                    const ch = children[i] as Element;
                    const k = ch.getAttribute('data-key');
                    if (k !== null) {
                      oldKeyMap.set(k, ch);
                      const n = Number(k);
                      if (!Number.isNaN(n)) oldKeyMap.set(n, ch);
                    }
                  }
                  // Persist the discovered mapping so future updates can use
                  // the move-by-key fast-path without re-scanning the DOM.
                  if (oldKeyMap.size > 0)
                    keyedElements.set(firstChild, oldKeyMap);
                } catch (e) {
                  void e;
                }
              }

              // Optional forced positional bulk path for large keyed lists
              try {
                if (process.env.ASKR_FORCE_BULK_POSREUSE === '1') {
                  try {
                    const keyedVnodes: Array<{
                      key: string | number;
                      vnode: VNode;
                    }> = [];
                    for (
                      let i = 0;
                      i < (vnodeChildren as VNode[]).length;
                      i++
                    ) {
                      const c = (vnodeChildren as VNode[])[i];
                      if (
                        _isDOMElement(c) &&
                        (c as DOMElement).key !== undefined
                      ) {
                        keyedVnodes.push({
                          key: (c as DOMElement).key as string | number,
                          vnode: c,
                        });
                      }
                    }
                    // Only apply when all children are keyed and count matches
                    if (
                      keyedVnodes.length > 0 &&
                      keyedVnodes.length === (vnodeChildren as VNode[]).length
                    ) {
                      if (
                        process.env.ASKR_FASTPATH_DEBUG === '1' ||
                        process.env.ASKR_FASTPATH_DEBUG === 'true'
                      ) {
                        logger.warn(
                          '[Askr][FASTPATH] forced positional bulk keyed reuse (evaluate-level)'
                        );
                      }
                      const stats = performBulkPositionalKeyedTextUpdate(
                        firstChild,
                        keyedVnodes
                      );
                      if (
                        process.env.NODE_ENV !== 'production' ||
                        process.env.ASKR_FASTPATH_DEBUG === '1'
                      ) {
                        try {
                          __ASKR_set('__LAST_FASTPATH_STATS', stats);
                          __ASKR_set('__LAST_FASTPATH_COMMIT_COUNT', 1);
                          __ASKR_incCounter('bulkKeyedPositionalForced');
                        } catch (e) {
                          void e;
                        }
                      }
                      // Rebuild keyed map
                      try {
                        const map = new Map<string | number, Element>();
                        const children = Array.from(firstChild.children);
                        for (let i = 0; i < children.length; i++) {
                          const el = children[i] as Element;
                          const k = el.getAttribute('data-key');
                          if (k !== null) {
                            map.set(k, el);
                            const n = Number(k);
                            if (!Number.isNaN(n)) map.set(n, el);
                          }
                        }
                        keyedElements.set(firstChild, map);
                      } catch (e) {
                        void e;
                      }
                    } else {
                      // Fall back to normal reconciliation below
                      const newKeyMap = reconcileKeyedChildren(
                        firstChild,
                        vnodeChildren,
                        oldKeyMap
                      );
                      keyedElements.set(firstChild, newKeyMap);
                    }
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
                    const newKeyMap = reconcileKeyedChildren(
                      firstChild,
                      vnodeChildren,
                      oldKeyMap
                    );
                    keyedElements.set(firstChild, newKeyMap);
                  }
                } else {
                  // Do reconciliation - this will reuse existing keyed elements
                  const newKeyMap = reconcileKeyedChildren(
                    firstChild,
                    vnodeChildren,
                    oldKeyMap
                  );
                  keyedElements.set(firstChild, newKeyMap);
                }
              } catch (e) {
                void e; // suppress unused variable lint
                // Fall back to normal reconciliation on error
                const newKeyMap = reconcileKeyedChildren(
                  firstChild,
                  vnodeChildren,
                  oldKeyMap
                );
                keyedElements.set(firstChild, newKeyMap);
              }
            } else {
              // Unkeyed - consider bulk text fast-path for large text-dominant updates
              if (isBulkTextFastPathEligible(firstChild, vnodeChildren)) {
                const stats = performBulkTextReplace(firstChild, vnodeChildren);
                // Dev-only instrumentation counters
                if (process.env.NODE_ENV !== 'production') {
                  try {
                    __ASKR_set('__LAST_BULK_TEXT_FASTPATH_STATS', stats);
                    __ASKR_incCounter('bulkTextHits');
                  } catch (e) {
                    void e;
                  }
                }
              } else {
                if (process.env.NODE_ENV !== 'production') {
                  try {
                    __ASKR_incCounter('bulkTextMisses');
                  } catch (e) {
                    void e;
                  }
                }
                // Fall back to existing per-node updates
                updateUnkeyedChildren(firstChild, vnodeChildren);
                keyedElements.delete(firstChild);
              }
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

              const options: boolean | AddEventListenerOptions | undefined =
                eventName === 'wheel' ||
                eventName === 'scroll' ||
                eventName.startsWith('touch')
                  ? { passive: true }
                  : undefined;
              if (options !== undefined)
                el.addEventListener(eventName, wrappedHandler, options);
              else el.addEventListener(eventName, wrappedHandler);
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

          // Use keyed reconciliation for children
          const newKeyMap = reconcileKeyedChildren(el, children, undefined);
          keyedElements.set(el, newKeyMap);
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
