import type { VNode } from './types';
import { createDOMNode, updateElementFromVnode, performBulkPositionalKeyedTextUpdate } from './dom';
import { keyedElements, _reconcilerRecordedParents, isKeyedReorderFastPathEligible } from './keyed';
import { removeAllListeners, cleanupInstanceIfPresent } from './cleanup';
import { isBulkCommitActive } from '../runtime/fastlane-shared';
import { __ASKR_set, __ASKR_incCounter } from './diag';
import { applyRendererFastPath } from './fastpath';

export const IS_DOM_AVAILABLE = typeof document !== 'undefined';

export function reconcileKeyedChildren(
  parent: Element,
  newChildren: VNode[],
  oldKeyMap: Map<string | number, Element> | undefined
): Map<string | number, Element> {
  const newKeyMap = new Map<string | number, Element>();

  const keyedVnodes: Array<{ key: string | number; vnode: VNode }> = [];
  const unkeyedVnodes: VNode[] = [];

  for (let i = 0; i < newChildren.length; i++) {
    const child = newChildren[i];
    if (typeof child === 'object' && child !== null && 'type' in child) {
      const childObj = child as unknown as Record<string, unknown>;
      const rawKey =
        childObj.key ??
        (childObj.props as Record<string, unknown> | undefined)?.key;
      if (rawKey !== undefined) {
        const key: string | number =
          typeof rawKey === 'symbol'
            ? String(rawKey)
            : (rawKey as string | number);
        keyedVnodes.push({ key, vnode: child });
      } else {
        unkeyedVnodes.push(child);
      }
    } else {
      unkeyedVnodes.push(child);
    }
  }

  // Helper type for narrowings to avoid `any` casts in lint rules
  type VnodeObj = VNode & { type?: unknown; props?: Record<string, unknown> };


  // Try renderer fast-path early for large keyed reorder-only updates.
  try {
    const decision = isKeyedReorderFastPathEligible(parent, newChildren, oldKeyMap);
    if (
      (decision.useFastPath && keyedVnodes.length >= 128) ||
      // If we're executing inside a runtime bulk commit (fastlane), prefer the
      // renderer fast-path to ensure the single-commit invariant is preserved.
      isBulkCommitActive()
    ) {
      try {
        const map = applyRendererFastPath(parent, keyedVnodes, oldKeyMap, unkeyedVnodes);
        if (map) {
          try {
            keyedElements.set(parent, map);
          } catch (e) {
            void e;
          }
          return map;
        }
      } catch (e) {
        void e;
      }
    }

    // Heuristic: if the majority of children *by position* have matching tags
    // and are simple text/intrinsic children, prefer the positional bulk
    // positional update path which reuses existing elements by index and
    // preserves listeners. This is conservative and only used for relatively
    // small lists where the renderer fast-path declines.
    try {
      const total = keyedVnodes.length;
      if (total >= 10) {
        let matchCount = 0;
        try {
          for (let i = 0; i < total; i++) {
            const vnode = keyedVnodes[i].vnode as VnodeObj;
            if (!vnode || typeof vnode !== 'object' || typeof vnode.type !== 'string') continue;
            const el = parent.children[i] as Element | undefined;
            if (!el) continue;
            if (el.tagName.toLowerCase() === String(vnode.type).toLowerCase()) matchCount++;
          }
        } catch (e) {
          void e;
        }
        // Require high positional match fraction to keep this conservative
        if (matchCount / total >= 0.9) {
          // Additionally, decline this positional path if prop changes are present
          // that we cannot safely patch by remapping keys in-place. This mirrors
          // the conservative rule in the runtime classifier.
          let hasPropChanges = false;
          try {
            for (let i = 0; i < total; i++) {
              const vnode = keyedVnodes[i].vnode as VnodeObj;
              const el = parent.children[i] as Element | undefined;
              if (!el || !vnode || typeof vnode !== 'object') continue;
              const props = vnode.props || {};
              for (const k of Object.keys(props)) {
                if (k === 'children' || k === 'key') continue;
                if (k.startsWith('on') && k.length > 2) continue;
                if (k.startsWith('data-')) continue;
                const v = props[k];
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
                } catch (e) {
                  hasPropChanges = true;
                  void e;
                  break;
                }
              }
              if (hasPropChanges) break;
            }
          } catch (e) {
            void e;
          }

          if (hasPropChanges) {
            // Decline positional path when props differ
          } else {
            try {
              const stats = performBulkPositionalKeyedTextUpdate(parent, keyedVnodes);
              if (process.env.NODE_ENV !== 'production' || process.env.ASKR_FASTPATH_DEBUG === '1') {
                try {
                  __ASKR_set('__LAST_FASTPATH_STATS', stats);
                  __ASKR_set('__LAST_FASTPATH_COMMIT_COUNT', 1);
                  __ASKR_incCounter('bulkKeyedPositionalHits');
                } catch (e) {
                  void e;
                }
              }
              // Rebuild keyed map
              try {
                const map = new Map<string | number, Element>();
                const children = Array.from(parent.children);
                for (let i = 0; i < children.length; i++) {
                  const el = children[i] as Element;
                  const k = el.getAttribute('data-key');
                  if (k !== null) {
                    map.set(k, el);
                    const n = Number(k);
                    if (!Number.isNaN(n)) map.set(n, el);
                  }
                }
                keyedElements.set(parent, map);
              } catch (e) {
                void e;
              }
              return keyedElements.get(parent) as Map<string | number, Element>;
            } catch (e) {
              void e;
            }
          }
        }
      }
    } catch (e) {
      void e;
    }

  } catch (e) {
    void e;
  }

  const finalNodes: Node[] = [];
  // Track used old elements to handle duplicate keys deterministically
  const usedOldEls = new WeakSet<Node>();

  const resolveOldElOnce = (k: string | number) => {
    if (!oldKeyMap) return undefined;
    // Fast-path: directly from oldKeyMap if available and not used
    const direct = oldKeyMap.get(k);
    if (direct && !usedOldEls.has(direct)) {
      usedOldEls.add(direct);
      return direct;
    }
    const s = String(k);
    const byString = oldKeyMap.get(s);
    if (byString && !usedOldEls.has(byString)) {
      usedOldEls.add(byString);
      return byString;
    }
    const n = Number(String(k));
    if (!Number.isNaN(n)) {
      const byNum = oldKeyMap.get(n as number);
      if (byNum && !usedOldEls.has(byNum)) {
        usedOldEls.add(byNum);
        return byNum;
      }
    }

    // Fallback: scan parent children to find the next matching element
    try {
      const children = Array.from(parent.children) as Element[];
      for (const ch of children) {
        if (usedOldEls.has(ch)) continue;
        const attr = ch.getAttribute('data-key');
        if (attr === s) {
          usedOldEls.add(ch);
          return ch;
        }
        const numAttr = Number(attr);
        if (!Number.isNaN(numAttr) && numAttr === (k as number)) {
          usedOldEls.add(ch);
          return ch;
        }
      }
    } catch (e) {
      void e;
    }

    return undefined;
  };

  // Positional reconciliation: iterate over new children and decide reuse
  for (let i = 0; i < newChildren.length; i++) {
    const child = newChildren[i];

    // Keyed child
    if (typeof child === 'object' && child !== null && 'type' in child) {
      const childObj = child as unknown as Record<string, unknown>;
      const rawKey =
        childObj.key ??
        (childObj.props as Record<string, unknown> | undefined)?.key;
      if (rawKey !== undefined) {
        const key: string | number =
          typeof rawKey === 'symbol' ? String(rawKey) : (rawKey as string | number);
        const el = resolveOldElOnce(key);
        if (el && el.parentElement === parent) {
          updateElementFromVnode(el, child as VNode);
          finalNodes.push(el);
          newKeyMap.set(key, el);
          continue;
        }
        const dom = createDOMNode(child as VNode);
        if (dom) {
          finalNodes.push(dom);
          if (dom instanceof Element) newKeyMap.set(key, dom);
        }
        continue;
      }
    }

    // Unkeyed or primitive child — try positional reuse if existing child is unkeyed
    try {
      const existing = parent.children[i] as Element | undefined;
      if (
        existing &&
        (typeof child === 'string' || typeof child === 'number') &&
        existing.nodeType === 1
      ) {
        // primitive -> existing element: update text content
        existing.textContent = String(child);
        finalNodes.push(existing);
        usedOldEls.add(existing);
        continue;
      }
      if (
        existing &&
        typeof child === 'object' &&
        child !== null &&
        'type' in child &&
        (existing.getAttribute('data-key') === null || existing.getAttribute('data-key') === undefined) &&
        typeof (child as VnodeObj).type === 'string' &&
        existing.tagName.toLowerCase() === String((child as VnodeObj).type).toLowerCase()
      ) {
        updateElementFromVnode(existing, child as VNode);
        finalNodes.push(existing);
        usedOldEls.add(existing);
        continue;
      }

      // If the slot is occupied by a keyed node, try to find an available
      // unkeyed element elsewhere to preserve positional identity for
      // unkeyed siblings (critical for mixed keyed/unkeyed cases).
      try {
        const avail = Array.from(parent.children).find(
          (ch) => !usedOldEls.has(ch) && ch.getAttribute('data-key') === null
        );
        if (avail) {
          if (typeof child === 'string' || typeof child === 'number') {
            avail.textContent = String(child);
          } else if (
            typeof child === 'object' &&
            child !== null &&
            'type' in child &&
            typeof (child as VnodeObj).type === 'string' &&
            avail.tagName.toLowerCase() === String((child as VnodeObj).type).toLowerCase()
          ) {
            updateElementFromVnode(avail, child as VNode);
          } else {
            // If shape mismatches, rebuild
            const dom = createDOMNode(child as VNode);
            if (dom) {
              finalNodes.push(dom);
              continue;
            }
          }
          usedOldEls.add(avail);
          finalNodes.push(avail);
          continue;
        }
      } catch (e) {
        void e;
      }
    } catch (e) {
      void e;
    }

    // Fallback: create DOM node
    const dom = createDOMNode(child as VNode);
    if (dom) finalNodes.push(dom);
  }

  // SSR guard: if DOM unavailable, do a conservative no-op
  if (typeof document === 'undefined') return newKeyMap;

  const fragment = document.createDocumentFragment();
  for (let i = 0; i < finalNodes.length; i++)
    fragment.appendChild(finalNodes[i]);

  try {
    const existing = Array.from(parent.childNodes);
    for (const n of existing) {
      if (n instanceof Element) removeAllListeners(n);
      cleanupInstanceIfPresent(n);
    }
  } catch (e) {
    void e;
  }

  try {
    __ASKR_incCounter('__DOM_REPLACE_COUNT');
    __ASKR_set('__LAST_DOM_REPLACE_STACK_RECONCILE', new Error().stack);
  } catch (e) {
    void e;
  }

  parent.replaceChildren(fragment);
  keyedElements.delete(parent);
  return newKeyMap;
}
