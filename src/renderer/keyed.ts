import type { VNode } from './types';

interface _KeyedChild {
  key: string | number;
  vnode: unknown;
}

export const keyedElements = new WeakMap<
  Element,
  Map<string | number, Element>
>();

// Exported for runtime use: retrieve existing keyed map for a parent element
export function getKeyMapForElement(el: Element) {
  return keyedElements.get(el);
}

// Populate a keyed map for an element by scanning its immediate children for
// `data-key` attributes. This can be called proactively by runtime layers
// that want to ensure keyed maps are available before reconciliation.
export function populateKeyMapForElement(parent: Element): void {
  try {
    if (keyedElements.has(parent)) return;
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
      // Fallback: map by textContent when keys are not materialized as attrs
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
    if (domMap.size > 0) keyedElements.set(parent, domMap);
  } catch (e) {
    void e;
  }
}

// Track which parents had the reconciler record fast-path stats during the
// current evaluation, so we can preserve diagnostics across additional
// reconciliations within the same render pass without leaking between runs.
export const _reconcilerRecordedParents = new WeakSet<Element>();

export function isKeyedReorderFastPathEligible(
  parent: Element,
  newChildren: VNode[],
  oldKeyMap: Map<string | number, Element> | undefined
) {
  const keyedVnodes: Array<{ key: string | number; vnode: VNode }> = [];
  for (let i = 0; i < newChildren.length; i++) {
    const child = newChildren[i];
    if (typeof child === 'object' && child !== null && 'type' in child) {
      const childObj = child as unknown as Record<string, unknown>;
      if (childObj.key !== undefined) {
        keyedVnodes.push({
          key: childObj.key as string | number,
          vnode: child,
        });
      }
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
    if (typeof vnode !== 'object' || vnode === null) continue;
    const vnodeObj = vnode as unknown as { props?: Record<string, unknown> };
    const props = vnodeObj.props || {};
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
    if (!el || typeof vnode !== 'object' || vnode === null) continue;
    const vnodeObj = vnode as unknown as { props?: Record<string, unknown> };
    const props = vnodeObj.props || {};
    for (const k of Object.keys(props)) {
      if (k === 'children' || k === 'key') continue;
      if (k.startsWith('on') && k.length > 2) continue;
      if (k.startsWith('data-')) continue; // ignore data-* attrs (e.g. data-key)
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
