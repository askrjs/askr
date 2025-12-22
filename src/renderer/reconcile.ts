import type { VNode } from './types';
import {
  createDOMNode,
  updateElementFromVnode,
  performBulkPositionalKeyedTextUpdate,
} from './dom';
import {
  keyedElements,
  _reconcilerRecordedParents,
  isKeyedReorderFastPathEligible,
} from './keyed';
import { logger } from '../dev/logger';
import { applyRendererFastPath } from './fastpath';

export function reconcileKeyedChildren(
  parent: Element,
  newChildren: VNode[],
  oldKeyMap: Map<string | number, Element> | undefined
): Map<string | number, Element> {
  // The implementation was moved from index.ts; keep it identical here.
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
        continue;
      }
    }
    unkeyedVnodes.push(child);
  }

  if (!oldKeyMap || oldKeyMap.size === 0) {
    try {
      const domMap = new Map<string | number, Element>();
      const children = Array.from(parent.children);
      for (let i = 0; i < children.length; i++) {
        const ch = children[i] as Element;
        const k = ch.getAttribute('data-key');
        if (k !== null) {
          domMap.set(k, ch);
          const n = Number(k);
          if (!Number.isNaN(n)) domMap.set(n, ch);
        }
      }
      if (domMap.size === 0) {
        for (let i = 0; i < children.length; i++) {
          const ch = children[i] as Element;
          const text = (ch.textContent || '').trim();
          if (text) {
            domMap.set(text, ch);
            const n = Number(text);
            if (!Number.isNaN(n)) domMap.set(n, ch);
          }
        }
      }
      if (domMap.size > 0) {
        oldKeyMap = domMap;
        try {
          keyedElements.set(parent, domMap);
        } catch (e) {
          void e;
        }
      }
    } catch (e) {
      void e;
    }
  }

  const resolveOldEl = (k: string | number) => {
    if (!oldKeyMap) return undefined;
    const direct = oldKeyMap.get(k);
    if (direct) return direct;
    const s = String(k);
    const byString = oldKeyMap.get(s);
    if (byString) return byString;
    const n = Number(String(k));
    if (!Number.isNaN(n)) return oldKeyMap.get(n as number);
    return undefined;
  };

  // Compute some simple heuristics and attempt partial fast-paths first (same as original)
  try {
    let hasPropsPresent = false;
    for (let i = 0; i < keyedVnodes.length; i++) {
      const vnode = keyedVnodes[i].vnode;
      if (typeof vnode !== 'object' || vnode === null) continue;
      const vnodeObj = vnode as unknown as { props?: Record<string, unknown> };
      const props = vnodeObj.props || {};
      for (const k of Object.keys(props)) {
        if (k === 'children' || k === 'key') continue;
        if (k.startsWith('on') && k.length > 2) continue;
        if (k.startsWith('data-')) continue;
        hasPropsPresent = true;
        break;
      }
      if (hasPropsPresent) break;
    }

    const decision = isKeyedReorderFastPathEligible(
      parent,
      newChildren,
      oldKeyMap
    );
    const likelyRendererFastPath = decision.useFastPath;

    // simple positional bulk keyed text update
    try {
      const parentChildren = Array.from(parent.children);
      const present = new Set<string | number>();
      for (let i = 0; i < parentChildren.length; i++) {
        const attr = parentChildren[i].getAttribute('data-key');
        if (attr !== null) {
          present.add(attr);
          const n = Number(attr);
          if (!Number.isNaN(n)) present.add(n);
        }
      }

      let missing = 0;
      for (let i = 0; i < keyedVnodes.length; i++) {
        const k = keyedVnodes[i].key;
        if (!present.has(k)) missing++;
      }

      const missingRatio = missing / Math.max(1, keyedVnodes.length);

      const allSimpleText =
        keyedVnodes.length > 0 &&
        keyedVnodes.every(({ vnode }) => {
          if (typeof vnode !== 'object' || vnode === null) return false;
          const dv = vnode as unknown as {
            type?: unknown;
            children?: unknown;
            props?: Record<string, unknown>;
          };
          if (typeof dv.type !== 'string') return false;
          const ch = dv.children || dv.props?.children;
          if (ch === undefined) return true;
          if (Array.isArray(ch)) {
            return (
              ch.length === 1 &&
              (typeof ch[0] === 'string' || typeof ch[0] === 'number')
            );
          }
          return typeof ch === 'string' || typeof ch === 'number';
        });

      if (
        missingRatio > 0.5 &&
        allSimpleText &&
        !hasPropsPresent &&
        parentChildren.length > 0
      ) {
        try {
          const stats = performBulkPositionalKeyedTextUpdate(
            parent,
            keyedVnodes
          );
          if (
            process.env.NODE_ENV !== 'production' ||
            process.env.ASKR_FASTPATH_DEBUG === '1'
          ) {
            try {
              const gl = globalThis as Record<string, unknown>;
              (gl as Record<string, unknown>)['__ASKR_LAST_FASTPATH_STATS'] =
                stats;
              const counters =
                (gl['__ASKR_FASTPATH_COUNTERS'] as
                  | Record<string, unknown>
                  | undefined) || {};
              (counters as Record<string, unknown>)['bulkKeyedPositionalHits'] =
                ((counters as Record<string, number>)[
                  'bulkKeyedPositionalHits'
                ] || 0) + 1;
              (gl as Record<string, unknown>)['__ASKR_FASTPATH_COUNTERS'] =
                counters;
              try {
                _reconcilerRecordedParents.add(parent);
              } catch (e) {
                void e;
              }
              (gl as Record<string, unknown>)[
                '__ASKR_LAST_FASTPATH_COMMIT_COUNT'
              ] = 1;
            } catch (e) {
              void e;
            }
          }

          // Rebuild the key map from DOM and return
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
            return map;
          } catch (e) {
            void e;
          }
        } catch (e) {
          void e;
        }
      }
    } catch (e) {
      void e;
    }

    if (
      oldKeyMap &&
      keyedVnodes.length > 0 &&
      !hasPropsPresent &&
      !likelyRendererFastPath
    ) {
      let _allPresent = true;
      for (const { key } of keyedVnodes) {
        const el = resolveOldEl(key);
        if (!el || el.parentElement !== parent) {
          _allPresent = false;
          break;
        }
      }

      try {
        let anchor: Node | null = parent.firstChild;
        let createdNodes = 0;
        let reusedCount = 0;
        for (const { key, vnode } of keyedVnodes) {
          let el = resolveOldEl(key);
          if (!el || el.parentElement !== parent) {
            try {
              const ks = String(key);
              const byAttr = parent.querySelector(`[data-key="${ks}"]`);
              if (byAttr && byAttr.parentElement === parent)
                el = byAttr as Element;
              else {
                const pcs = Array.from(parent.children);
                for (let j = 0; j < pcs.length; j++) {
                  const ch = pcs[j] as Element;
                  if ((ch.textContent || '').trim() === ks) {
                    el = ch;
                    break;
                  }
                }
              }
            } catch (e) {
              void e;
            }
          }

          if (el && el.parentElement === parent) {
            if (anchor === el) {
              anchor = el.nextSibling;
            } else {
              parent.insertBefore(el, anchor);
            }
            updateElementFromVnode(el as Element, vnode as VNode);
            newKeyMap.set(key, el);
            reusedCount++;
          } else {
            const dom = createDOMNode(vnode);
            if (dom) {
              parent.insertBefore(dom, anchor);
              if (dom instanceof Element) newKeyMap.set(key, dom);
              anchor = dom.nextSibling;
              createdNodes++;
            }
          }
        }

        for (const vnode of unkeyedVnodes) {
          const dom = createDOMNode(vnode);
          if (dom) parent.appendChild(dom);
        }

        try {
          const gl = globalThis as Record<string, unknown>;
          (gl as Record<string, unknown>)['__ASKR_LAST_FASTPATH_STATS'] = {
            n: keyedVnodes.length,
            created: createdNodes,
            reused: reusedCount,
          } as const;
          (gl as Record<string, unknown>)['__ASKR_LAST_FASTPATH_COMMIT_COUNT'] =
            1;
          const counters =
            (gl['__ASKR_FASTPATH_COUNTERS'] as
              | Record<string, unknown>
              | undefined) || {};
          (counters as Record<string, unknown>)['partialMoveByKeyHits'] =
            ((counters as Record<string, number>)['partialMoveByKeyHits'] ||
              0) + 1;
          (gl as Record<string, unknown>)['__ASKR_FASTPATH_COUNTERS'] =
            counters;
          try {
            _reconcilerRecordedParents.add(parent);
          } catch (e) {
            void e;
          }
        } catch (e) {
          void e;
        }

        return newKeyMap;
      } catch {
        // Fall through
      }
    }
  } catch {
    // ignore and proceed
  }

  const decision = isKeyedReorderFastPathEligible(
    parent,
    newChildren,
    oldKeyMap
  );
  const useFastPath = decision.useFastPath;
  logger.warn('[Askr][FASTPATH][DEV] decision', decision);

  // Renderer fast-path: reorder-only commits during runtime fast-lane.
  // This performs a single atomic DOM commit (replaceChildren) and records
  // commit count for runtime invariants.
  if (useFastPath && keyedVnodes.length >= 128) {
    try {
      const map = applyRendererFastPath(
        parent,
        keyedVnodes,
        oldKeyMap,
        unkeyedVnodes
      );
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

  try {
    const hugeThreshold = Number(process.env.ASKR_BULK_HUGE_THRESHOLD) || 2048;
    if (!useFastPath && keyedVnodes.length >= hugeThreshold) {
      let allSimple = true;
      for (let i = 0; i < keyedVnodes.length; i++) {
        const vnode = keyedVnodes[i].vnode;
        if (typeof vnode !== 'object' || vnode === null) {
          allSimple = false;
          break;
        }
        const dv = vnode as unknown as {
          type?: unknown;
          children?: unknown;
          props?: Record<string, unknown>;
        };
        if (typeof dv.type !== 'string') {
          allSimple = false;
          break;
        }
        const ch = dv.children || dv.props?.children;
        if (ch === undefined) continue;
        if (Array.isArray(ch)) {
          if (
            ch.length !== 1 ||
            (typeof ch[0] !== 'string' && typeof ch[0] !== 'number')
          ) {
            allSimple = false;
            break;
          }
        } else if (typeof ch !== 'string' && typeof ch !== 'number') {
          allSimple = false;
          break;
        }
      }

      if (allSimple) {
        try {
          const stats = performBulkPositionalKeyedTextUpdate(
            parent,
            keyedVnodes
          );
          if (
            process.env.NODE_ENV !== 'production' ||
            process.env.ASKR_FASTPATH_DEBUG === '1'
          ) {
            try {
              const gl = globalThis as Record<string, unknown>;
              (gl as Record<string, unknown>)['__ASKR_LAST_FASTPATH_STATS'] =
                stats;
              const counters =
                (gl['__ASKR_FASTPATH_COUNTERS'] as
                  | Record<string, unknown>
                  | undefined) || {};
              (counters as Record<string, unknown>)['bulkKeyedHugeFallback'] =
                ((counters as Record<string, number>)[
                  'bulkKeyedHugeFallback'
                ] || 0) + 1;
              (gl as Record<string, unknown>)['__ASKR_FASTPATH_COUNTERS'] =
                counters;
              (gl as Record<string, unknown>)['__ASKR_BULK_DIAG'] = {
                phase: 'bulk-keyed-huge-fallback',
                stats,
              } as const;
            } catch (e) {
              void e;
            }
          }
          return newKeyMap;
        } catch (e) {
          void e;
        }
      }
    }
  } catch (e) {
    void e;
  }

  // If none of the optimized paths applied, do a conservative atomic build
  // (append new nodes and replace parent children atomically)
  // Rebuild final node list
  try {
    const finalNodes: Node[] = [];

    for (let i = 0; i < keyedVnodes.length; i++) {
      const { key, vnode } = keyedVnodes[i];
      const el = resolveOldEl(key);
      if (el && el.parentElement === parent) {
        // Update in place and append
        updateElementFromVnode(el, vnode as VNode);
        finalNodes.push(el);
        newKeyMap.set(key, el);
      } else {
        const dom = createDOMNode(vnode);
        if (dom) {
          finalNodes.push(dom);
          if (dom instanceof Element) newKeyMap.set(key, dom);
        }
      }
    }

    for (let i = 0; i < unkeyedVnodes.length; i++) {
      const dom = createDOMNode(unkeyedVnodes[i]);
      if (dom) finalNodes.push(dom);
    }

    const fragment = document.createDocumentFragment();
    for (let i = 0; i < finalNodes.length; i++)
      fragment.appendChild(finalNodes[i]);
    parent.replaceChildren(fragment);
    keyedElements.delete(parent);

    return newKeyMap;
  } catch (e) {
    void e;
  }

  return newKeyMap;
}
