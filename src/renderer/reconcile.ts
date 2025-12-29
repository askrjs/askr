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
import { removeAllListeners, cleanupInstanceIfPresent } from './cleanup';
import { isBulkCommitActive } from '../runtime/fastlane';
import { __ASKR_set, __ASKR_incCounter } from './diag';
import { applyRendererFastPath } from './fastpath';
import {
  extractKey,
  checkPropChanges,
  recordFastPathStats,
  recordDOMReplace,
} from './utils';

export const IS_DOM_AVAILABLE = typeof document !== 'undefined';

// Helper type for narrowings
type VnodeObj = VNode & { type?: unknown; props?: Record<string, unknown> };

export function reconcileKeyedChildren(
  parent: Element,
  newChildren: VNode[],
  oldKeyMap: Map<string | number, Element> | undefined
): Map<string | number, Element> {
  const { keyedVnodes, unkeyedVnodes } = partitionChildren(newChildren);

  // Try fast paths first
  const fastPathResult = tryFastPaths(
    parent,
    newChildren,
    keyedVnodes,
    unkeyedVnodes,
    oldKeyMap
  );
  if (fastPathResult) return fastPathResult;

  // Full reconciliation
  return performFullReconciliation(parent, newChildren, keyedVnodes, oldKeyMap);
}

/** Partition children into keyed and unkeyed */
function partitionChildren(newChildren: VNode[]): {
  keyedVnodes: Array<{ key: string | number; vnode: VNode }>;
  unkeyedVnodes: VNode[];
} {
  const keyedVnodes: Array<{ key: string | number; vnode: VNode }> = [];
  const unkeyedVnodes: VNode[] = [];

  for (let i = 0; i < newChildren.length; i++) {
    const child = newChildren[i];
    const key = extractKey(child);
    if (key !== undefined) {
      keyedVnodes.push({ key, vnode: child });
    } else {
      unkeyedVnodes.push(child);
    }
  }

  return { keyedVnodes, unkeyedVnodes };
}

/** Try fast paths before full reconciliation */
function tryFastPaths(
  parent: Element,
  newChildren: VNode[],
  keyedVnodes: Array<{ key: string | number; vnode: VNode }>,
  unkeyedVnodes: VNode[],
  oldKeyMap: Map<string | number, Element> | undefined
): Map<string | number, Element> | null {
  try {
    // Try renderer fast-path for large keyed reorder-only updates
    const rendererResult = tryRendererFastPath(
      parent,
      newChildren,
      keyedVnodes,
      unkeyedVnodes,
      oldKeyMap
    );
    if (rendererResult) return rendererResult;

    // Try positional bulk update for medium-sized lists
    const positionalResult = tryPositionalBulkUpdate(parent, keyedVnodes);
    if (positionalResult) return positionalResult;
  } catch {
    // Fall through to full reconciliation
  }

  return null;
}

/** Try renderer fast-path */
function tryRendererFastPath(
  parent: Element,
  newChildren: VNode[],
  keyedVnodes: Array<{ key: string | number; vnode: VNode }>,
  unkeyedVnodes: VNode[],
  oldKeyMap: Map<string | number, Element> | undefined
): Map<string | number, Element> | null {
  const decision = isKeyedReorderFastPathEligible(
    parent,
    newChildren,
    oldKeyMap
  );

  if (
    (decision.useFastPath && keyedVnodes.length >= 128) ||
    isBulkCommitActive()
  ) {
    try {
      const map = applyRendererFastPath(
        parent,
        keyedVnodes,
        oldKeyMap,
        unkeyedVnodes
      );
      if (map) {
        keyedElements.set(parent, map);
        return map;
      }
    } catch {
      // Fall through
    }
  }

  return null;
}

/** Try positional bulk update for medium-sized lists */
function tryPositionalBulkUpdate(
  parent: Element,
  keyedVnodes: Array<{ key: string | number; vnode: VNode }>
): Map<string | number, Element> | null {
  const total = keyedVnodes.length;
  if (total < 10) return null;

  const matchCount = countPositionalMatches(parent, keyedVnodes);

  // Require high positional match fraction
  if (matchCount / total < 0.9) return null;

  // Check for prop changes that would prevent positional update
  if (hasPositionalPropChanges(parent, keyedVnodes)) return null;

  // Perform positional update
  try {
    const stats = performBulkPositionalKeyedTextUpdate(parent, keyedVnodes);
    recordFastPathStats(stats, 'bulkKeyedPositionalHits');

    rebuildKeyedMap(parent);
    return keyedElements.get(parent) as Map<string | number, Element>;
  } catch {
    return null;
  }
}

/** Count how many vnodes match parent children by position and tag */
function countPositionalMatches(
  parent: Element,
  keyedVnodes: Array<{ key: string | number; vnode: VNode }>
): number {
  let matchCount = 0;

  try {
    for (let i = 0; i < keyedVnodes.length; i++) {
      const vnode = keyedVnodes[i].vnode as VnodeObj;
      if (!vnode || typeof vnode !== 'object' || typeof vnode.type !== 'string')
        continue;

      const el = parent.children[i] as Element | undefined;
      if (!el) continue;

      if (el.tagName.toLowerCase() === String(vnode.type).toLowerCase()) {
        matchCount++;
      }
    }
  } catch {
    // Ignore
  }

  return matchCount;
}

/** Check if positional prop changes would prevent bulk update */
function hasPositionalPropChanges(
  parent: Element,
  keyedVnodes: Array<{ key: string | number; vnode: VNode }>
): boolean {
  try {
    for (let i = 0; i < keyedVnodes.length; i++) {
      const vnode = keyedVnodes[i].vnode as VnodeObj;
      const el = parent.children[i] as Element | undefined;
      if (!el || !vnode || typeof vnode !== 'object') continue;

      if (checkPropChanges(el, vnode.props || {})) {
        return true;
      }
    }
  } catch {
    return true;
  }

  return false;
}

/** Rebuild keyed map from parent children */
function rebuildKeyedMap(parent: Element): void {
  try {
    const map = new Map<string | number, Element>();
    for (let el = parent.firstElementChild; el; el = el.nextElementSibling) {
      const k = el.getAttribute('data-key');
      if (k !== null) {
        map.set(k, el);
        const n = Number(k);
        if (!Number.isNaN(n)) map.set(n, el);
      }
    }
    keyedElements.set(parent, map);
  } catch {
    // Ignore
  }
}

/** Perform full reconciliation when fast paths don't apply */
function performFullReconciliation(
  parent: Element,
  newChildren: VNode[],
  keyedVnodes: Array<{ key: string | number; vnode: VNode }>,
  oldKeyMap: Map<string | number, Element> | undefined
): Map<string | number, Element> {
  const newKeyMap = new Map<string | number, Element>();
  const finalNodes: Node[] = [];
  const usedOldEls = new WeakSet<Node>();

  const resolveOldElOnce = createOldElResolver(parent, oldKeyMap, usedOldEls);

  // Positional reconciliation
  for (let i = 0; i < newChildren.length; i++) {
    const child = newChildren[i];
    const node = reconcileSingleChild(
      child,
      i,
      parent,
      resolveOldElOnce,
      usedOldEls,
      newKeyMap
    );
    if (node) finalNodes.push(node);
  }

  // SSR guard
  if (typeof document === 'undefined') return newKeyMap;

  commitReconciliation(parent, finalNodes);
  keyedElements.delete(parent);

  return newKeyMap;
}

/** Create resolver for finding old elements by key */
function createOldElResolver(
  parent: Element,
  oldKeyMap: Map<string | number, Element> | undefined,
  usedOldEls: WeakSet<Node>
): (k: string | number) => Element | undefined {
  return (k: string | number) => {
    if (!oldKeyMap) return undefined;

    // Fast-path: directly from oldKeyMap
    const direct = oldKeyMap.get(k);
    if (direct && !usedOldEls.has(direct)) {
      usedOldEls.add(direct);
      return direct;
    }

    // Try string form
    const s = String(k);
    const byString = oldKeyMap.get(s);
    if (byString && !usedOldEls.has(byString)) {
      usedOldEls.add(byString);
      return byString;
    }

    // Try numeric form
    const n = Number(s);
    if (!Number.isNaN(n)) {
      const byNum = oldKeyMap.get(n);
      if (byNum && !usedOldEls.has(byNum)) {
        usedOldEls.add(byNum);
        return byNum;
      }
    }

    // Fallback: scan parent children
    return scanForElementByKey(parent, k, s, usedOldEls);
  };
}

/** Scan parent children for element with matching key */
function scanForElementByKey(
  parent: Element,
  k: string | number,
  keyStr: string,
  usedOldEls: WeakSet<Node>
): Element | undefined {
  try {
    for (let ch = parent.firstElementChild; ch; ch = ch.nextElementSibling) {
      if (usedOldEls.has(ch)) continue;
      const attr = ch.getAttribute('data-key');
      if (attr === keyStr) {
        usedOldEls.add(ch);
        return ch;
      }
      if (attr !== null) {
        const numAttr = Number(attr);
        if (!Number.isNaN(numAttr) && numAttr === (k as number)) {
          usedOldEls.add(ch);
          return ch;
        }
      }
    }
  } catch {
    // Ignore
  }
  return undefined;
}

/** Reconcile a single child */
function reconcileSingleChild(
  child: VNode,
  index: number,
  parent: Element,
  resolveOldElOnce: (k: string | number) => Element | undefined,
  usedOldEls: WeakSet<Node>,
  newKeyMap: Map<string | number, Element>
): Node | null {
  // Keyed child
  const key = extractKey(child);
  if (key !== undefined) {
    return reconcileKeyedChild(child, key, parent, resolveOldElOnce, newKeyMap);
  }

  // Unkeyed or primitive child
  return reconcileUnkeyedChild(child, index, parent, usedOldEls);
}

/** Reconcile a keyed child */
function reconcileKeyedChild(
  child: VNode,
  key: string | number,
  parent: Element,
  resolveOldElOnce: (k: string | number) => Element | undefined,
  newKeyMap: Map<string | number, Element>
): Node | null {
  const el = resolveOldElOnce(key);

  if (el && el.parentElement === parent) {
    // Strict keyed guarantee: if the element tag changes for an existing key,
    // replace the DOM node rather than mutating in place.
    try {
      const childObj = child as VnodeObj;
      if (
        childObj &&
        typeof childObj === 'object' &&
        typeof childObj.type === 'string'
      ) {
        if (el.tagName.toLowerCase() === String(childObj.type).toLowerCase()) {
          updateElementFromVnode(el, child);
          newKeyMap.set(key, el);
          return el;
        }
      }
    } catch {
      // Fall through to replacement
    }
  }

  const dom = createDOMNode(child);
  if (dom) {
    if (dom instanceof Element) newKeyMap.set(key, dom);
    return dom;
  }

  return null;
}

/** Reconcile an unkeyed or primitive child */
function reconcileUnkeyedChild(
  child: VNode,
  index: number,
  parent: Element,
  usedOldEls: WeakSet<Node>
): Node | null {
  try {
    const existing = parent.children[index] as Element | undefined;

    // Primitive child with existing element
    if (
      existing &&
      (typeof child === 'string' || typeof child === 'number') &&
      existing.nodeType === 1
    ) {
      existing.textContent = String(child);
      usedOldEls.add(existing);
      return existing;
    }

    // Element child matching existing unkeyed element
    if (canReuseElement(existing, child)) {
      updateElementFromVnode(existing!, child);
      usedOldEls.add(existing!);
      return existing!;
    }

    // Try to find available unkeyed element elsewhere
    const avail = findAvailableUnkeyedElement(parent, usedOldEls);
    if (avail) {
      const reuseResult = tryReuseElement(avail, child, usedOldEls);
      if (reuseResult) return reuseResult;
    }
  } catch {
    // Fall through to create new
  }

  const dom = createDOMNode(child);
  return dom;
}

/** Check if existing element can be reused for child */
function canReuseElement(existing: Element | undefined, child: VNode): boolean {
  if (!existing) return false;
  if (typeof child !== 'object' || child === null || !('type' in child))
    return false;

  const childObj = child as VnodeObj;
  const existingKey = existing.getAttribute('data-key');
  const hasNoKey = existingKey === null || existingKey === undefined;

  return (
    hasNoKey &&
    typeof childObj.type === 'string' &&
    existing.tagName.toLowerCase() === String(childObj.type).toLowerCase()
  );
}

/** Find available unkeyed element in parent */
function findAvailableUnkeyedElement(
  parent: Element,
  usedOldEls: WeakSet<Node>
): Element | undefined {
  for (let ch = parent.firstElementChild; ch; ch = ch.nextElementSibling) {
    if (usedOldEls.has(ch)) continue;
    if (ch.getAttribute('data-key') === null) return ch;
  }
  return undefined;
}

/** Try to reuse available element for child */
function tryReuseElement(
  avail: Element,
  child: VNode,
  usedOldEls: WeakSet<Node>
): Node | null {
  if (typeof child === 'string' || typeof child === 'number') {
    avail.textContent = String(child);
    usedOldEls.add(avail);
    return avail;
  }

  if (typeof child === 'object' && child !== null && 'type' in child) {
    const childObj = child as VnodeObj;
    if (
      typeof childObj.type === 'string' &&
      avail.tagName.toLowerCase() === String(childObj.type).toLowerCase()
    ) {
      updateElementFromVnode(avail, child);
      usedOldEls.add(avail);
      return avail;
    }
  }

  return null;
}

/** Commit reconciliation by replacing parent children */
function commitReconciliation(parent: Element, finalNodes: Node[]): void {
  const fragment = document.createDocumentFragment();
  for (let i = 0; i < finalNodes.length; i++) {
    fragment.appendChild(finalNodes[i]);
  }

  // Cleanup existing nodes
  try {
    // HOT PATH: avoid Array.from(parent.childNodes) allocation
    for (let n = parent.firstChild; n; ) {
      const next = n.nextSibling;
      if (n instanceof Element) removeAllListeners(n);
      cleanupInstanceIfPresent(n);
      n = next;
    }
  } catch {
    // SLOW PATH: cleanup failure (dev-only diagnostics live elsewhere)
    // Ignore
  }

  recordDOMReplace('reconcile');
  parent.replaceChildren(fragment);
}
