import type { VNode } from './types';
import {
  extractKey,
  buildKeyMapFromChildren,
  isIgnoredForPropChanges,
  hasPropChanged,
  hasNonTrivialProps,
} from './utils';

// ─────────────────────────────────────────────────────────────────────────────
// Key Map Registry
// ─────────────────────────────────────────────────────────────────────────────

export const keyedElements = new WeakMap<
  Element,
  Map<string | number, Element>
>();

/**
 * Retrieve existing keyed map for a parent element (runtime use)
 */
export function getKeyMapForElement(el: Element) {
  return keyedElements.get(el);
}

/**
 * Populate a keyed map for an element by scanning its immediate children
 * for `data-key` attributes. Proactive initialization for runtime layers.
 */
export function populateKeyMapForElement(parent: Element): void {
  try {
    if (keyedElements.has(parent)) return;

    let domMap = buildKeyMapFromChildren(parent);

    // Fallback: map by textContent when keys are not materialized as attrs
    if (domMap.size === 0) {
      domMap = new Map();
      const children = Array.from(parent.children);
      for (const ch of children) {
        const text = (ch.textContent || '').trim();
        if (text) {
          domMap.set(text, ch);
          const n = Number(text);
          if (!Number.isNaN(n)) domMap.set(n, ch);
        }
      }
    }

    if (domMap.size > 0) keyedElements.set(parent, domMap);
  } catch {
    // ignore
  }
}

// Track which parents had the reconciler record fast-path stats during the
// current evaluation, so we can preserve diagnostics across additional
// reconciliations within the same render pass without leaking between runs.
export const _reconcilerRecordedParents = new WeakSet<Element>();

// ─────────────────────────────────────────────────────────────────────────────
// Fast-Path Eligibility
// ─────────────────────────────────────────────────────────────────────────────

interface KeyedVnode {
  key: string | number;
  vnode: VNode;
}

/**
 * Extract keyed vnodes from children array
 */
function extractKeyedVnodes(newChildren: VNode[]): KeyedVnode[] {
  const result: KeyedVnode[] = [];
  for (const child of newChildren) {
    const key = extractKey(child);
    if (key !== undefined) {
      result.push({ key, vnode: child });
    }
  }
  return result;
}

/**
 * Compute LIS (Longest Increasing Subsequence) length for positions
 */
function computeLISLength(positions: number[]): number {
  const tails: number[] = [];
  for (const pos of positions) {
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
  return tails.length;
}

/**
 * Check if any vnode has non-trivial props
 */
function checkVnodesHaveProps(keyedVnodes: KeyedVnode[]): boolean {
  for (const { vnode } of keyedVnodes) {
    if (typeof vnode !== 'object' || vnode === null) continue;
    const vnodeObj = vnode as unknown as { props?: Record<string, unknown> };
    if (vnodeObj.props && hasNonTrivialProps(vnodeObj.props)) {
      return true;
    }
  }
  return false;
}

/**
 * Check for prop changes between vnodes and existing elements
 */
function checkVnodePropChanges(
  keyedVnodes: KeyedVnode[],
  oldKeyMap: Map<string | number, Element> | undefined
): boolean {
  for (const { key, vnode } of keyedVnodes) {
    const el = oldKeyMap?.get(key);
    if (!el || typeof vnode !== 'object' || vnode === null) continue;
    const vnodeObj = vnode as unknown as { props?: Record<string, unknown> };
    const props = vnodeObj.props || {};
    for (const k of Object.keys(props)) {
      if (isIgnoredForPropChanges(k)) continue;
      if (hasPropChanged(el, k, props[k])) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Determine if keyed reorder fast-path should be used
 */
export function isKeyedReorderFastPathEligible(
  parent: Element,
  newChildren: VNode[],
  oldKeyMap: Map<string | number, Element> | undefined
) {
  const keyedVnodes = extractKeyedVnodes(newChildren);
  const totalKeyed = keyedVnodes.length;
  const newKeyOrder = keyedVnodes.map((kv) => kv.key);
  const oldKeyOrder = oldKeyMap ? Array.from(oldKeyMap.keys()) : [];

  // Count moves needed
  let moveCount = 0;
  for (let i = 0; i < newKeyOrder.length; i++) {
    const k = newKeyOrder[i];
    if (i >= oldKeyOrder.length || oldKeyOrder[i] !== k || !oldKeyMap?.has(k)) {
      moveCount++;
    }
  }

  // Check move threshold triggers
  const FAST_MOVE_THRESHOLD_ABS = 64;
  const FAST_MOVE_THRESHOLD_REL = 0.1;
  const cheapMoveTrigger =
    totalKeyed >= 128 &&
    oldKeyOrder.length > 0 &&
    moveCount >
      Math.max(
        FAST_MOVE_THRESHOLD_ABS,
        Math.floor(totalKeyed * FAST_MOVE_THRESHOLD_REL)
      );

  // Compute LIS trigger for large lists
  let lisTrigger = false;
  let lisLen = 0;
  if (totalKeyed >= 128) {
    const parentChildren = Array.from(parent.children);
    const positions = keyedVnodes.map(({ key }) => {
      const el = oldKeyMap?.get(key);
      return el?.parentElement === parent ? parentChildren.indexOf(el) : -1;
    });
    lisLen = computeLISLength(positions);
    lisTrigger = lisLen < Math.floor(totalKeyed * 0.5);
  }

  // Check for props that would prevent fast-path
  const hasPropsPresent = checkVnodesHaveProps(keyedVnodes);
  const hasPropChanges = checkVnodePropChanges(keyedVnodes, oldKeyMap);

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
