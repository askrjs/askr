import type { VNode } from './types';
import { extractKeyedVnodes, type KeyedVnode } from './keyed-children';
import {
  isIgnoredForPropChanges,
  hasPropChanged,
  buildKeyMapFromChildren,
  getMaterializedKey,
} from './utils';

export type { KeyedVnode } from './keyed-children';

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

function keyToken(key: string | number): string {
  return `${typeof key}:${String(key)}`;
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
      currentKeys.push(keyToken(key));

      keyCount++;
    }

    if (keyCount > 0) {
      return { keyCount, currentKeys };
    }
  }

  let keyCount = 0;

  try {
    for (let el = parent.firstElementChild; el; el = el.nextElementSibling) {
      const key = getMaterializedKey(el);
      if (key === undefined) {
        continue;
      }

      currentKeys.push(keyToken(key));
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
export interface KeyedReorderDecision {
  useFastPath: boolean;
  totalKeyed: number;
  totalChildren: number;
  currentKeyCount: number;
  moveCount: number;
  lisLen: number;
  hasPropChanges: boolean;
  isWholeKeyedList: boolean;
}

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
 * Plan keyed reorder eligibility from one snapshot of keyed order and props.
 */
export function planKeyedReorderFastPath(
  parent: Element,
  keyedVnodes: KeyedVnode[],
  totalChildren: number,
  oldKeyMap: Map<string | number, Element> | undefined
): KeyedReorderDecision {
  const totalKeyed = keyedVnodes.length;
  const isWholeKeyedList = totalKeyed === totalChildren;
  const shouldEvaluateShape =
    isWholeKeyedList && totalKeyed >= LIS_THRESHOLD_MIN;

  if (!shouldEvaluateShape) {
    return {
      useFastPath: false,
      totalKeyed,
      totalChildren,
      currentKeyCount: 0,
      moveCount: 0,
      lisLen: 0,
      hasPropChanges: false,
      isWholeKeyedList,
    };
  }

  const hasPropChanges = checkVnodePropChanges(keyedVnodes, oldKeyMap);
  if (hasPropChanges) {
    return {
      useFastPath: false,
      totalKeyed,
      totalChildren,
      currentKeyCount: 0,
      moveCount: 0,
      lisLen: 0,
      hasPropChanges,
      isWholeKeyedList,
    };
  }

  const { keyCount: currentKeyCount, currentKeys } = collectCurrentKeyOrder(
    parent,
    oldKeyMap
  );

  let moveCount = 0;
  for (let i = 0; i < totalKeyed; i++) {
    if (currentKeys[i] !== keyToken(keyedVnodes[i].key)) {
      moveCount++;
    }
  }

  const FAST_MOVE_THRESHOLD_ABS = 64;
  const FAST_MOVE_THRESHOLD_REL = 0.1;
  const cheapMoveTrigger =
    shouldEvaluateShape &&
    currentKeyCount > 0 &&
    moveCount >
      Math.max(
        FAST_MOVE_THRESHOLD_ABS,
        Math.floor(totalKeyed * FAST_MOVE_THRESHOLD_REL)
      );

  let lisTrigger = false;
  let lisLen = 0;
  if (shouldEvaluateShape && !cheapMoveTrigger) {
    const indexByKey = new Map<string, number>();
    for (let i = 0; i < currentKeys.length; i++) {
      indexByKey.set(currentKeys[i], i);
    }

    const positions: number[] = Array(totalKeyed).fill(-1);
    for (let i = 0; i < totalKeyed; i++) {
      positions[i] = indexByKey.get(keyToken(keyedVnodes[i].key)) ?? -1;
    }
    lisLen = computeLISLength(positions);
    lisTrigger = lisLen < Math.floor(totalKeyed * 0.5);
  }

  if (!shouldEvaluateShape || !(cheapMoveTrigger || lisTrigger)) {
    return {
      useFastPath: false,
      totalKeyed,
      totalChildren,
      currentKeyCount,
      moveCount,
      lisLen,
      hasPropChanges: false,
      isWholeKeyedList,
    };
  }

  return {
    useFastPath: true,
    totalKeyed,
    totalChildren,
    currentKeyCount,
    moveCount,
    lisLen,
    hasPropChanges: false,
    isWholeKeyedList,
  } as const;
}

export function isKeyedReorderFastPathEligible(
  parent: Element,
  newChildren: VNode[],
  oldKeyMap: Map<string | number, Element> | undefined
): KeyedReorderDecision {
  return planKeyedReorderFastPath(
    parent,
    extractKeyedVnodes(newChildren),
    newChildren.length,
    oldKeyMap
  );
}
