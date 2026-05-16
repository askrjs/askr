import type { VNode } from './types';
import {
  extractKey,
  buildKeyMapFromChildren,
  isIgnoredForPropChanges,
  hasPropChanged,
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

// Configuration: LIS fast-path thresholds
const LIS_THRESHOLD_MIN = 64; // Minimum list size for LIS optimization

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

interface CurrentKeyOrderSnapshot {
  keyCount: number;
  currentKeys: string[];
}

function collectCurrentKeyOrder(
  parent: Element,
  oldKeyMap: Map<string | number, Element> | undefined
): CurrentKeyOrderSnapshot {
  const currentKeys: string[] = [];

  if (oldKeyMap && oldKeyMap.size > 0) {
    let lastElement: Element | null = null;
    let keyCount = 0;

    for (const [key, el] of oldKeyMap) {
      if (el === lastElement) {
        continue;
      }

      lastElement = el;
      const normalizedKey = String(key);
      currentKeys.push(normalizedKey);

      keyCount++;
    }

    if (keyCount > 0) {
      return { keyCount, currentKeys };
    }
  }

  let keyCount = 0;

  try {
    for (let el = parent.firstElementChild; el; el = el.nextElementSibling) {
      const keyAttr = el.getAttribute('data-key');
      if (keyAttr === null) {
        continue;
      }

      currentKeys.push(keyAttr);
      keyCount++;
    }
  } catch {
    // ignore
  }

  return { keyCount, currentKeys };
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
  const newKeyStrings = keyedVnodes.map(({ key }) => String(key));
  const { keyCount: currentKeyCount, currentKeys } = collectCurrentKeyOrder(
    parent,
    oldKeyMap
  );

  // Count moves needed
  let moveCount = 0;
  for (let i = 0; i < newKeyStrings.length; i++) {
    if (currentKeys[i] !== newKeyStrings[i]) {
      moveCount++;
    }
  }

  // Check move threshold triggers
  const FAST_MOVE_THRESHOLD_ABS = 64;
  const FAST_MOVE_THRESHOLD_REL = 0.1;
  const cheapMoveTrigger =
    totalKeyed >= LIS_THRESHOLD_MIN &&
    currentKeyCount > 0 &&
    moveCount >
      Math.max(
        FAST_MOVE_THRESHOLD_ABS,
        Math.floor(totalKeyed * FAST_MOVE_THRESHOLD_REL)
      );

  // Compute LIS trigger for large lists
  let lisTrigger = false;
  let lisLen = 0;
  if (totalKeyed >= LIS_THRESHOLD_MIN && !cheapMoveTrigger) {
    const indexByKey = new Map<string, number>();
    for (let i = 0; i < currentKeys.length; i++) {
      indexByKey.set(currentKeys[i], i);
    }

    const positions: number[] = [];
    for (let i = 0; i < newKeyStrings.length; i++) {
      positions.push(indexByKey.get(newKeyStrings[i]) ?? -1);
    }
    lisLen = computeLISLength(positions);
    lisTrigger = lisLen < Math.floor(totalKeyed * 0.5);
  }

  // Check for props that would prevent fast-path
  // Only block if props have CHANGED, not just if props exist
  const hasPropChanges = checkVnodePropChanges(keyedVnodes, oldKeyMap);

  // Allow fastpath even with props present, as long as props haven't changed
  // This enables fast-path for common patterns like <Row item={item} onClick={...} />
  const useFastPath = (cheapMoveTrigger || lisTrigger) && !hasPropChanges;

  return {
    useFastPath,
    totalKeyed,
    moveCount,
    lisLen,
    hasPropChanges,
  } as const;
}
