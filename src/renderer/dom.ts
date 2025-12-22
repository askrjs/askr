import { globalScheduler } from '../runtime/scheduler';
import { logger } from '../dev/logger';
import type { Props } from '../shared/types';
import { Fragment } from '../jsx/jsx-runtime';
import {
  CONTEXT_FRAME_SYMBOL,
  withContext,
  getCurrentContextFrame,
  ContextFrame,
} from '../runtime/context';
import {
  createComponentInstance,
  renderComponentInline,
  mountInstanceInline,
  getCurrentInstance,
} from '../runtime/component';
import type {
  ComponentInstance,
  ComponentFunction,
} from '../runtime/component';
import {
  cleanupInstanceIfPresent,
  elementListeners,
  removeAllListeners,
} from './cleanup';
import { __ASKR_set, __ASKR_incCounter } from './diag';
import { _isDOMElement, type DOMElement, type VNode } from './types';
import { keyedElements } from './keyed';

type ElementWithContext = DOMElement & {
  [CONTEXT_FRAME_SYMBOL]?: ContextFrame;
  __instance?: ComponentInstance;
};

export const IS_DOM_AVAILABLE = typeof document !== 'undefined';

// Create a DOM node from a VNode
export function createDOMNode(node: unknown): Node | null {
  // SSR guard: don't attempt DOM ops when document is unavailable
  if (!IS_DOM_AVAILABLE) {
    if (process.env.NODE_ENV !== 'production') {
      try {
        logger.warn('[Askr] createDOMNode called in non-DOM environment');
      } catch (e) {
        void e;
      }
    }
    return null;
  }

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

      // Set attributes and event handlers in single pass (allocation-free)
      for (const key in props) {
        const value = (props as Record<string, unknown>)[key];
        // Skip special keys
        if (key === 'children' || key === 'key') continue;
        if (value === undefined || value === null || value === false) continue;

        if (key.startsWith('on') && key.length > 2) {
          const eventName =
            key.slice(2).charAt(0).toLowerCase() + key.slice(3).toLowerCase();
          const wrappedHandler = (event: Event) => {
            globalScheduler.setInHandler(true);
            try {
              (value as EventListener)(event);
            } catch (error) {
              logger.error('[Askr] Event handler error:', error);
            } finally {
              globalScheduler.setInHandler(false);
              // If the handler enqueued tasks while we disallowed microtask kicks,
              // ensure we schedule a microtask to flush them now that the handler
              // has completed. This mirrors the behavior in scheduleEventHandler.
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
          };

          // Determine sensible default options (use passive for touch/scroll/wheel where appropriate)
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
        } else if (key === 'class' || key === 'className') {
          el.className = String(value);
        } else if (key === 'value' || key === 'checked') {
          // Only set `value`/`checked` on form controls where it's meaningful
          const tag = type.toLowerCase();
          if (key === 'value') {
            if (tag === 'input' || tag === 'textarea' || tag === 'select') {
              (el as HTMLInputElement & Props).value = String(value);
              el.setAttribute('value', String(value));
            } else {
              el.setAttribute('value', String(value));
            }
          } else {
            if (tag === 'input') {
              (el as HTMLInputElement & Props).checked = Boolean(value);
              el.setAttribute('checked', String(Boolean(value)));
            } else {
              el.setAttribute('checked', String(Boolean(value)));
            }
          }
        } else {
          el.setAttribute(key, String(value));
        }
      }

      // Materialize key on created element so DOM-based fast-path can find it
      const vnodeKey =
        (node as DOMElement).key ?? (props as Record<string, unknown>)?.key;
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
                try {
                  const inst = getCurrentInstance();
                  const name = inst?.fn?.name || '<anonymous>';
                  logger.warn(
                    `Missing keys on dynamic lists in ${name}. Each child in a list should have a unique "key" prop.`
                  );
                } catch (e) {
                  logger.warn(
                    'Missing keys on dynamic lists. Each child in a list should have a unique "key" prop.'
                  );
                  void e;
                }
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

      const componentFn = type as (props: Props) => unknown;
      const isAsync = componentFn.constructor.name === 'AsyncFunction';

      if (isAsync) {
        throw new Error(
          'Async components are not supported. Use resource() for async work.'
        );
      }

      // Ensure there is a persistent instance object attached to this vnode
      const vnodeAny = node as ElementWithContext;
      let childInstance = vnodeAny.__instance;
      if (!childInstance) {
        childInstance = createComponentInstance(
          `comp-${Math.random().toString(36).slice(2, 7)}`,
          componentFn as ComponentFunction,
          props || {},
          null
        );
        vnodeAny.__instance = childInstance;
      }

      if (snapshot) {
        childInstance.ownerFrame = snapshot;
      }

      const result = withContext(snapshot, () =>
        renderComponentInline(childInstance)
      );

      if (result instanceof Promise) {
        throw new Error(
          'Async components are not supported. Components must return synchronously.'
        );
      }

      const dom = withContext(snapshot, () => createDOMNode(result));

      if (dom instanceof Element) {
        mountInstanceInline(childInstance, dom);
        return dom;
      }

      // For non-Element returns (Text nodes or DocumentFragment), ensure the
      // instance backref is attached to an Element that will actually be
      // inserted into the DOM. Append returned nodes into a host element and
      // mount the instance on that host so cleanup works deterministically.
      const host = document.createElement('div');
      if (dom instanceof DocumentFragment) {
        host.appendChild(dom);
      } else if (dom) {
        host.appendChild(dom);
      }
      mountInstanceInline(childInstance, host);
      return host;
    }

    // Fragment support
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

/**
 * Update an existing element's attributes and children from vnode
 */
export function updateElementFromVnode(
  el: Element,
  vnode: VNode,
  updateChildren = true
): void {
  if (!_isDOMElement(vnode)) {
    return;
  }

  const props = vnode.props || {};

  // Ensure key is materialized on existing elements so DOM-based scans succeed
  // Respect both top-level `key` and `props.key` for compatibility with
  // tests and manual vnode construction.
  const vnodeKey =
    (vnode as DOMElement).key ?? (vnode as DOMElement).props?.key;
  if (vnodeKey !== undefined) {
    el.setAttribute('data-key', String(vnodeKey));
  }

  // Diff and update event listeners and other attributes
  const existingListeners = elementListeners.get(el);
  const desiredEventNames = new Set<string>();

  for (const key in props) {
    const value = (props as Record<string, unknown>)[key];
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
          if (entry.options !== undefined)
            el.removeEventListener(eventName, entry.handler, entry.options);
          else el.removeEventListener(eventName, entry.handler);
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

      const wrappedHandler = (event: Event) => {
        globalScheduler.setInHandler(true);
        try {
          (value as EventListener)(event);
        } catch (error) {
          logger.error('[Askr] Event handler error:', error);
        } finally {
          globalScheduler.setInHandler(false);
        }
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

export function updateElementChildren(
  el: Element,
  children: VNode | VNode[] | undefined
): void {
  if (!children) {
    el.textContent = '';
    return;
  }

  if (
    !Array.isArray(children) &&
    (typeof children === 'string' || typeof children === 'number')
  ) {
    if (el.childNodes.length === 1 && el.firstChild?.nodeType === 3) {
      (el.firstChild as Text).data = String(children);
    } else {
      el.textContent = String(children);
    }
    return;
  }

  if (Array.isArray(children)) {
    updateUnkeyedChildren(el, children as unknown[]);
    return;
  }

  el.textContent = '';
  const dom = createDOMNode(children);
  if (dom) el.appendChild(dom);
}

export function updateUnkeyedChildren(
  parent: Element,
  newChildren: unknown[]
): void {
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
      // Clean up any component instance mounted on this node
      cleanupInstanceIfPresent(current);
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
            if (current instanceof Element) removeAllListeners(current);
            cleanupInstanceIfPresent(current);
            parent.replaceChild(dom, current);
          }
        }
      } else {
        // Non-string types: replace conservatively
        const dom = createDOMNode(next);
        if (dom) {
          if (current instanceof Element) removeAllListeners(current);
          cleanupInstanceIfPresent(current);
          parent.replaceChild(dom, current);
        }
      }
    } else {
      // Fallback for other types: replace
      const dom = createDOMNode(next);
      if (dom) {
        if (current instanceof Element) removeAllListeners(current);
        cleanupInstanceIfPresent(current);
        parent.replaceChild(dom, current);
      }
    }
  }
}

/**
 * Positional update for keyed lists where keys changed en-masse but structure
 * (element tags and simple text children) remains identical. This updates
 * text content in-place and remaps the `data-key` attribute to the new key so
 * subsequent updates can find elements by their data-key.
 */
export function performBulkPositionalKeyedTextUpdate(
  parent: Element,
  keyedVnodes: Array<{ key: string | number; vnode: VNode }>
) {
  const total = keyedVnodes.length;
  let reused = 0;
  let updatedKeys = 0;
  const t0 =
    typeof performance !== 'undefined' && performance.now
      ? performance.now()
      : Date.now();

  for (let i = 0; i < total; i++) {
    const { key, vnode } = keyedVnodes[i];
    const ch = parent.children[i] as Element | undefined;
    if (
      ch &&
      _isDOMElement(vnode) &&
      typeof (vnode as DOMElement).type === 'string'
    ) {
      const vnodeType = (vnode as DOMElement).type as string;
      if (ch.tagName.toLowerCase() === vnodeType.toLowerCase()) {
        const children =
          (vnode as DOMElement).children ||
          (vnode as DOMElement).props?.children;

        try {
          if (process.env.ASKR_FASTPATH_DEBUG === '1' || process.env.ASKR_FASTPATH_DEBUG === 'true') {
            logger.warn('[Askr][FASTPATH] positional idx', i, {
              chTag: ch.tagName.toLowerCase(),
              vnodeType,
              chChildNodes: ch.childNodes.length,
              childrenType: Array.isArray(children) ? 'array' : typeof children,
            });
          }
        } catch (e) {
          void e;
        }

        if (typeof children === 'string' || typeof children === 'number') {
          if (ch.childNodes.length === 1 && ch.firstChild?.nodeType === 3) {
            (ch.firstChild as Text).data = String(children);
          } else {
            ch.textContent = String(children);
          }
        } else if (
          Array.isArray(children) &&
          children.length === 1 &&
          (typeof children[0] === 'string' || typeof children[0] === 'number')
        ) {
          if (ch.childNodes.length === 1 && ch.firstChild?.nodeType === 3) {
            (ch.firstChild as Text).data = String(children[0]);
          } else {
            ch.textContent = String(children[0]);
          }
        } else {
          updateElementFromVnode(ch, vnode as VNode);
        }
        try {
          ch.setAttribute('data-key', String(key));
          updatedKeys++;
        } catch (e) {
          void e;
        }
        reused++;
        continue;
      } else {
        try {
          if (process.env.ASKR_FASTPATH_DEBUG === '1' || process.env.ASKR_FASTPATH_DEBUG === 'true') {
            logger.warn('[Askr][FASTPATH] positional tag mismatch', i, {
              chTag: ch.tagName.toLowerCase(),
              vnodeType,
            });
          }
        } catch (e) {
          void e;
        }
      }
    } else {
      try {
        if (process.env.ASKR_FASTPATH_DEBUG === '1' || process.env.ASKR_FASTPATH_DEBUG === 'true') {
          logger.warn('[Askr][FASTPATH] positional missing or invalid', i, {
            ch: !!ch,
          });
        }
      } catch (e) {
        void e;
      }
    }
    // Fallback: replace the node at position i
    const dom = createDOMNode(vnode);
    if (dom) {
      const existing = parent.children[i];
      if (existing) {
        cleanupInstanceIfPresent(existing);
        parent.replaceChild(dom, existing);
      } else parent.appendChild(dom);
    }
  }

  const t =
    typeof performance !== 'undefined' && performance.now
      ? performance.now() - t0
      : 0;

  try {
    const newKeyMap = new Map<string | number, Element>();
    for (let i = 0; i < total; i++) {
      const k = keyedVnodes[i].key;
      const ch = parent.children[i] as Element | undefined;
      if (ch) newKeyMap.set(k, ch);
    }
    keyedElements.set(parent, newKeyMap);
  } catch (e) {
    void e;
  }

  const stats = { n: total, reused, updatedKeys, t } as const;

  try {
    if (process.env.ASKR_FASTPATH_DEBUG === '1' || process.env.ASKR_FASTPATH_DEBUG === 'true') {
      logger.warn('[Askr][FASTPATH] bulk positional stats', stats);
    }
    __ASKR_set('__LAST_FASTPATH_STATS', stats);
    __ASKR_set('__LAST_FASTPATH_COMMIT_COUNT', 1);
    __ASKR_incCounter('bulkKeyedPositionalHits');
  } catch (e) {
    void e;
  }

  return stats;
}

export function performBulkTextReplace(parent: Element, newChildren: VNode[]) {
  const t0 =
    typeof performance !== 'undefined' && performance.now
      ? performance.now()
      : Date.now();
  const existing = Array.from(parent.childNodes);
  const finalNodes: Node[] = [];
  let reused = 0;
  let created = 0;

  for (let i = 0; i < newChildren.length; i++) {
    const vnode = newChildren[i];
    const existingNode = existing[i];

    if (typeof vnode === 'string' || typeof vnode === 'number') {
      const text = String(vnode);
      if (existingNode && existingNode.nodeType === 3) {
        // Reuse existing text node
        (existingNode as Text).data = text;
        finalNodes.push(existingNode);
        reused++;
      } else {
        // Create detached text node
        finalNodes.push(document.createTextNode(text));
        created++;
      }
      continue;
    }

    if (typeof vnode === 'object' && vnode !== null && 'type' in vnode) {
      // If existing node is an element and tags match, update in place
      const vnodeObj = vnode as unknown as {
        type?: unknown;
        children?: unknown;
        props?: Record<string, unknown>;
      };
      if (typeof vnodeObj.type === 'string') {
        const tag = vnodeObj.type as string;
        if (
          existingNode &&
          existingNode.nodeType === 1 &&
          (existingNode as Element).tagName.toLowerCase() === tag.toLowerCase()
        ) {
          updateElementFromVnode(existingNode as Element, vnode as VNode);
          finalNodes.push(existingNode);
          reused++;
          continue;
        }
      }
      const dom = createDOMNode(vnode);
      if (dom) {
        finalNodes.push(dom);
        created++;
        continue;
      }
    }

    // Fallback: skip invalid vnode
  }

  const tBuild =
    (typeof performance !== 'undefined' && performance.now
      ? performance.now()
      : Date.now()) - t0;

  // Clean up instances that will be removed
  try {
    const toRemove = Array.from(parent.childNodes).filter(
      (n) => !finalNodes.includes(n)
    );
    for (const n of toRemove) {
      if (n instanceof Element) removeAllListeners(n);
      cleanupInstanceIfPresent(n);
    }
  } catch (e) {
    void e;
  }

  const fragStart = Date.now();
  const fragment = document.createDocumentFragment();
  for (let i = 0; i < finalNodes.length; i++)
    fragment.appendChild(finalNodes[i]);
  try {
    __ASKR_incCounter('__DOM_REPLACE_COUNT');
    __ASKR_set('__LAST_DOM_REPLACE_STACK_DOM', new Error().stack);
  } catch (e) {
    void e;
  }
  // Atomic replacement
  parent.replaceChildren(fragment);
  const tCommit = Date.now() - fragStart;

  // Clear keyed map for unkeyed path
  keyedElements.delete(parent);

  const stats = {
    n: newChildren.length,
    reused,
    created,
    tBuild,
    tCommit,
  } as const;

  try {
    // Record bulk-unkeyed fast-path stats for diagnostics/tests
    __ASKR_set('__LAST_BULK_TEXT_FASTPATH_STATS', stats);
    __ASKR_set('__LAST_FASTPATH_STATS', stats);
    __ASKR_set('__LAST_FASTPATH_COMMIT_COUNT', 1);
    __ASKR_incCounter('bulkTextFastpathHits');
  } catch (e) {
    void e;
  }

  return stats;
}

/**
 * Heuristic to detect large bulk text-dominant updates eligible for fast-path.
 * Conditions:
 *  - total children >= threshold
 *  - majority of children are simple text (string/number) or intrinsic elements
 *    with a single primitive child
 *  - conservative: avoid when component children or complex shapes present
 */
export function isBulkTextFastPathEligible(
  parent: Element,
  newChildren: VNode[]
) {
  const threshold = Number(process.env.ASKR_BULK_TEXT_THRESHOLD) || 1024;
  const requiredFraction = 0.8; // 80% of children should be simple text

  const total = Array.isArray(newChildren) ? newChildren.length : 0;
  if (total < threshold) {
    if (
      process.env.NODE_ENV !== 'production' ||
      process.env.ASKR_FASTPATH_DEBUG === '1'
    ) {
      try {
        __ASKR_set('__BULK_DIAG', {
          phase: 'bulk-unkeyed-eligible',
          reason: 'too-small',
          total,
          threshold,
        });
      } catch (e) {
        void e;
      }
    }
    return false;
  }

  let simple = 0;
  for (let i = 0; i < newChildren.length; i++) {
    const c = newChildren[i];
    if (typeof c === 'string' || typeof c === 'number') {
      simple++;
      continue;
    }
    if (typeof c === 'object' && c !== null && 'type' in c) {
      const dv = c as DOMElement;
      if (typeof dv.type === 'function') {
        if (
          process.env.NODE_ENV !== 'production' ||
          process.env.ASKR_FASTPATH_DEBUG === '1'
        ) {
          try {
            __ASKR_set('__BULK_DIAG', {
              phase: 'bulk-unkeyed-eligible',
              reason: 'component-child',
              index: i,
            });
          } catch (e) {
            void e;
          }
        }
        return false; // component child - decline
      }
      if (typeof dv.type === 'string') {
        const children = dv.children || dv.props?.children;
        if (!children) {
          // empty element - treat as simple
          simple++;
          continue;
        }
        if (Array.isArray(children)) {
          if (
            children.length === 1 &&
            (typeof children[0] === 'string' || typeof children[0] === 'number')
          ) {
            simple++;
            continue;
          }
        } else if (
          typeof children === 'string' ||
          typeof children === 'number'
        ) {
          simple++;
          continue;
        }
      }
    }
    // complex child - not simple
  }

  const fraction = simple / total;
  const eligible =
    fraction >= requiredFraction && parent.childNodes.length >= total;
  if (
    process.env.NODE_ENV !== 'production' ||
    process.env.ASKR_FASTPATH_DEBUG === '1'
  ) {
    try {
      __ASKR_set('__BULK_DIAG', {
        phase: 'bulk-unkeyed-eligible',
        total,
        simple,
        fraction,
        requiredFraction,
        eligible,
      });
    } catch (e) {
      void e;
    }
  }

  return eligible;
}
