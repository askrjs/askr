/**
 * ─────────────────────────────────────────────────────────────────────────────
 * RENDERER & RECONCILIATION INVARIANTS (LOCKED)
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * These invariants are NON-NEGOTIABLE. Any optimization or fast-path MUST
 * preserve them. Violations WILL produce incorrect DOM.
 *
 * 1. DOM ORDER DERIVES ONLY FROM CURRENT VNODE ORDER
 * --------------------------------------------------
 * - Final DOM child order MUST be reconstructed from the current vnode list.
 * - Reusing an existing DOM node does NOT imply it stays in the same position.
 * - Appending an existing Node to a DocumentFragment is the ONLY valid way
 *   to express reordering (it moves the node).
 *
 * ❌ NEVER skip fragment insertion because a node already has a parent.
 * ✅ ALWAYS append reused nodes into the fragment to establish order.
 *
 *
 * 2. VNODE IDENTITY ≠ VNODE STABILITY
 * ----------------------------------
 * - VNodes are mutable.
 * - `vnodeA === vnodeB` does NOT imply semantic equality.
 * - DOM reuse MUST NOT be gated on vnode identity alone.
 *
 * DOM reuse is allowed ONLY when:
 *   - element type is unchanged
 *   - structural shape is compatible
 *   - updates are applied explicitly via updateElementFromVnode
 *
 * ❌ NEVER assume "same object" means "no changes".
 *
 *
 * 3. KEYED RECONCILIATION IS ELEMENT-ONLY
 * --------------------------------------
 * - Keyed reconciliation assumes ELEMENT nodes, not Text or Comment nodes.
 * - Any fast-path using `parent.children[i]` MUST prove:
 *     - all children are elements
 *     - no text nodes are present
 *
 * ❌ NEVER index `parent.children` when text nodes may exist.
 * ✅ Use `parent.childNodes` or bail out to full reconciliation.
 *
 *
 * 4. PRIMITIVES MAP TO TEXT NODES
 * -------------------------------
 * - string/number children represent Text nodes, not Elements.
 * - Reconciliation MUST attempt Text-to-Text reuse before replacement.
 *
 * ❌ NEVER update element.textContent as a substitute for text reconciliation
 *    unless the shape is explicitly guaranteed.
 *
 *
 * 5. FAST-PATHS MUST BE STRICTLY SAFE
 * ----------------------------------
 * - Fast-paths are OPTIONAL.
 * - Correctness always beats performance.
 *
 * A fast-path MUST:
 *   - prove its eligibility
 *   - fall back cleanly on ANY ambiguity
 *   - never partially apply
 *
 *
 * 6. CLEANUP IS POSITION-INDEPENDENT
 * ---------------------------------
 * - Cleanup is based on removal from the DOM, not vnode position.
 * - Any node removed or replaced MUST:
 *     - remove listeners
 *     - cleanup component instances
 *
 *
 * 7. FOR-BOUNDARY & KEYED LISTS OBEY THE SAME RULES
 * ------------------------------------------------
 * - For-boundaries are NOT special in ordering semantics.
 * - Cached DOM nodes MUST still be reordered via fragment insertion.
 * - Cache is an optimization, not an ownership claim.
 *
 *
 * If you are unsure whether an optimization preserves these invariants:
 * DO NOT APPLY IT.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { DOMElement, VNode } from './types';
import {
  createDOMNode,
  syncComponentElement,
  updateElementFromVnode,
  performBulkPositionalKeyedTextUpdate,
} from './dom';
import type { Props } from '../common/props';
import {
  keyedElements,
  _reconcilerRecordedParents,
  planKeyedReorderFastPath,
} from './keyed';
import { teardownNodeSubtree } from './cleanup';
import { applyRendererFastPath } from './fastpath';
import { getRuntimeEnv } from './env';
import type { ComponentFunction } from '../runtime/component';
import {
  evaluateCaseState,
  evaluateShowState,
  type ControlBoundaryState,
} from '../runtime/control';
import { evaluateForState } from '../runtime/for';
import { __FOR_BOUNDARY__ } from '../common/vnode';
import {
  extractKey,
  checkPropChanges,
  recordFastPathStats,
  recordDOMReplace,
  tagNamesEqualIgnoreCase,
} from './utils';

export const IS_DOM_AVAILABLE = typeof document !== 'undefined';
const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

function getParentNamespace(parent: Element): string | undefined {
  return parent.namespaceURI === SVG_NAMESPACE ? SVG_NAMESPACE : undefined;
}

function resolveChildNamespace(
  type: string,
  parentNamespace: string | undefined
): string | undefined {
  if (type === 'svg') return SVG_NAMESPACE;
  if (parentNamespace === SVG_NAMESPACE && type !== 'foreignObject') {
    return SVG_NAMESPACE;
  }
  return undefined;
}

function canReuseIntrinsicElementInNamespace(
  existing: Element,
  type: string,
  parentNamespace: string | undefined
): boolean {
  if (!tagNamesEqualIgnoreCase(existing.tagName, type)) {
    return false;
  }

  const expectedNamespace = resolveChildNamespace(type, parentNamespace);
  return expectedNamespace === undefined
    ? true
    : existing.namespaceURI === expectedNamespace;
}

// Helper type for narrowings
type VnodeObj = VNode & { type?: unknown; props?: Record<string, unknown> };
type ComponentVNode = DOMElement & { type: ComponentFunction };

export function reconcileKeyedChildren(
  parent: Element,
  newChildren: VNode[],
  oldKeyMap: Map<string | number, Element> | undefined
): Map<string | number, Element> {
  const keyedVnodes = extractKeyedChildren(newChildren);

  // Ensure we have a key map before reconciliation to avoid O(n) DOM scans
  // during O(n) reconciliation loop (which would be O(n²))
  const ensuredOldKeyMap = oldKeyMap || buildKeyMapFromDOM(parent);

  // Try fast paths first
  const fastPathResult = tryFastPaths(
    parent,
    newChildren,
    keyedVnodes,
    ensuredOldKeyMap
  );
  if (fastPathResult) {
    return fastPathResult;
  }

  // Full reconciliation
  return performFullReconciliation(
    parent,
    newChildren,
    keyedVnodes,
    ensuredOldKeyMap
  );
}

/** Build key map from DOM children */
function buildKeyMapFromDOM(parent: Element): Map<string | number, Element> {
  const keyMap = new Map<string | number, Element>();
  try {
    for (let el = parent.firstElementChild; el; el = el.nextElementSibling) {
      const k = el.getAttribute('data-key');
      if (k !== null) {
        keyMap.set(k, el);
        const n = Number(k);
        if (!Number.isNaN(n)) keyMap.set(n, el);
      }
    }
  } catch {
    // Ignore
  }
  return keyMap;
}

/** Extract keyed children in a single pass. */
function extractKeyedChildren(
  newChildren: VNode[]
): Array<{ key: string | number; vnode: VNode }> {
  const keyedVnodes: Array<{ key: string | number; vnode: VNode }> = [];

  for (let i = 0; i < newChildren.length; i++) {
    const child = newChildren[i];
    const key = extractKey(child);
    if (key !== undefined) {
      keyedVnodes.push({ key, vnode: child });
    }
  }

  return keyedVnodes;
}

/** Try fast paths before full reconciliation */
function tryFastPaths(
  parent: Element,
  newChildren: VNode[],
  keyedVnodes: Array<{ key: string | number; vnode: VNode }>,
  oldKeyMap: Map<string | number, Element> | undefined
): Map<string | number, Element> | null {
  try {
    const forcedResult = tryForcedPositionalBulkUpdate(
      parent,
      newChildren,
      keyedVnodes
    );
    if (forcedResult) {
      return forcedResult;
    }

    // Try renderer fast-path for large keyed reorder-only updates
    const rendererResult = tryRendererFastPath(
      parent,
      keyedVnodes,
      newChildren.length,
      oldKeyMap
    );
    if (rendererResult) {
      return rendererResult;
    }

    // Try positional bulk update for medium-sized lists
    const positionalResult = tryPositionalBulkUpdate(parent, keyedVnodes);
    if (positionalResult) {
      return positionalResult;
    }
  } catch {
    // Fall through to full reconciliation
  }

  return null;
}

/** Try renderer fast-path */
function tryRendererFastPath(
  parent: Element,
  keyedVnodes: Array<{ key: string | number; vnode: VNode }>,
  totalChildren: number,
  oldKeyMap: Map<string | number, Element> | undefined
): Map<string | number, Element> | null {
  const decision = planKeyedReorderFastPath(
    parent,
    keyedVnodes,
    totalChildren,
    oldKeyMap
  );

  if (decision.useFastPath) {
    try {
      const map = applyRendererFastPath(parent, keyedVnodes, oldKeyMap);
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

/** Try the explicit test/bench forced positional keyed path. */
function tryForcedPositionalBulkUpdate(
  parent: Element,
  newChildren: VNode[],
  keyedVnodes: Array<{ key: string | number; vnode: VNode }>
): Map<string | number, Element> | null {
  if (getRuntimeEnv().ASKR_FORCE_BULK_POSREUSE !== '1') return null;
  if (keyedVnodes.length === 0 || keyedVnodes.length !== newChildren.length) {
    return null;
  }

  try {
    const stats = performBulkPositionalKeyedTextUpdate(parent, keyedVnodes);
    recordFastPathStats(stats, 'bulkKeyedPositionalForced');

    rebuildKeyedMap(parent);
    return keyedElements.get(parent) as Map<string | number, Element>;
  } catch {
    return null;
  }
}

/** Try positional bulk update for medium-sized lists */
function tryPositionalBulkUpdate(
  parent: Element,
  keyedVnodes: Array<{ key: string | number; vnode: VNode }>
): Map<string | number, Element> | null {
  const total = keyedVnodes.length;
  if (total < 10) return null;

  // CRITICAL INVARIANT: Only use children[] indexing if element-only is guaranteed
  // If parent has text nodes or comment nodes, bail to full reconciliation
  if (parent.children.length !== total) {
    return null;
  }

  const parentNamespace = getParentNamespace(parent);
  const matchCount = countPositionalMatches(
    parent,
    keyedVnodes,
    parentNamespace
  );

  // For keyed lists, the positional bulk update path makes sense in two cases:
  // 1. Perfect match (100%): All keys are in the right positions, just update text
  // 2. Very low match (<10%): Keys changed en-masse, treat as bulk re-key, reuse nodes by position
  // ANY mismatch at all means we have a reorder and need full reconciliation
  // to preserve DOM node identity correctly.
  const matchFraction = matchCount / total;

  if (keyedVnodes.length > 0) {
    // For keyed lists: require perfect match or very low match
    // matchCount !== total catches ANY reordering, even just 2 swapped elements
    if (matchCount !== total && matchFraction >= 0.1) {
      return null;
    }
  } else {
    // For unkeyed lists: use original threshold
    if (matchFraction < 0.9) {
      return null;
    }
  }

  // Check for prop changes that would prevent positional update
  if (hasPositionalPropChanges(parent, keyedVnodes)) {
    return null;
  }

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
  keyedVnodes: Array<{ key: string | number; vnode: VNode }>,
  parentNamespace: string | undefined
): number {
  let matchCount = 0;

  try {
    // For keyed children, use children (elements only) since keyed nodes are elements
    for (let i = 0; i < keyedVnodes.length; i++) {
      const vnode = keyedVnodes[i].vnode as VnodeObj;
      const expectedKey = keyedVnodes[i].key;

      if (!vnode || typeof vnode !== 'object' || typeof vnode.type !== 'string')
        continue;

      const el = parent.children[i] as Element | undefined;
      if (!el) continue;

      // For keyed lists, check BOTH tag name AND key match
      if (
        canReuseIntrinsicElementInNamespace(el, vnode.type, parentNamespace)
      ) {
        // Check if the element at this position has the expected key
        const actualKey = el.getAttribute('data-key');
        const keyMatches =
          actualKey === String(expectedKey) ||
          (actualKey !== null &&
            !Number.isNaN(Number(actualKey)) &&
            Number(actualKey) === expectedKey);

        if (keyMatches) {
          matchCount++;
        }
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
    // For keyed children, use children (elements only) since keyed nodes are elements
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
  const unkeyedEls = collectUnkeyedElements(parent);
  let unkeyedIndex = 0;
  const resolveUnkeyedOnce = (): Element | undefined => {
    while (unkeyedIndex < unkeyedEls.length) {
      const candidate = unkeyedEls[unkeyedIndex++];
      if (!usedOldEls.has(candidate)) return candidate;
    }
    return undefined;
  };

  // Positional reconciliation
  for (let i = 0; i < newChildren.length; i++) {
    const child = newChildren[i];
    const node = reconcileSingleChild(
      child,
      i,
      parent,
      resolveOldElOnce,
      resolveUnkeyedOnce,
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
  resolveUnkeyedOnce: () => Element | undefined,
  usedOldEls: WeakSet<Node>,
  newKeyMap: Map<string | number, Element>
): Node | null {
  const resolvedControlBoundary = prepareControlBoundaryResolution(child);
  if (resolvedControlBoundary !== null) {
    if (resolvedControlBoundary.remount) {
      return createDOMNode(
        resolvedControlBoundary.vnode,
        getParentNamespace(parent)
      );
    }

    return reconcileSingleChild(
      resolvedControlBoundary.vnode,
      index,
      parent,
      resolveOldElOnce,
      resolveUnkeyedOnce,
      usedOldEls,
      newKeyMap
    );
  }

  // Keyed child
  const key = extractKey(child);

  if (key !== undefined) {
    return reconcileKeyedChild(child, key, parent, resolveOldElOnce, newKeyMap);
  }

  return reconcileUnkeyedChild(
    child,
    index,
    parent,
    resolveUnkeyedOnce,
    usedOldEls
  );
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
  const parentNamespace = getParentNamespace(parent);

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
        if (
          canReuseIntrinsicElementInNamespace(
            el,
            childObj.type,
            parentNamespace
          )
        ) {
          updateElementFromVnode(el, child);
          newKeyMap.set(key, el);
          return el;
        }
      }
      if (isComponentVNode(child)) {
        const synced = syncComponentElement(
          el,
          child,
          child.type,
          ((child.props ?? {}) as Props) || {},
          parentNamespace
        );
        if (synced) {
          if (synced instanceof Element) newKeyMap.set(key, synced);
          return synced;
        }
      }
    } catch {
      // Fall through to replacement
    }
  }

  const dom = createDOMNode(child, parentNamespace);
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
  resolveUnkeyedOnce: () => Element | undefined,
  usedOldEls: WeakSet<Node>
): Node | null {
  const parentNamespace = getParentNamespace(parent);

  try {
    // Use childNodes (includes Text nodes) instead of children (elements only)
    const existing = parent.childNodes[index] as Node | undefined;

    // Primitive child: try to reuse Text node if available
    if (typeof child === 'string' || typeof child === 'number') {
      if (existing && existing.nodeType === 3) {
        // Text node: reuse in-place
        (existing as Text).data = String(child);
        usedOldEls.add(existing);
        return existing;
      }
      return createDOMNode(child, parentNamespace);
    }

    if (existing instanceof Element) {
      const synced = trySyncComponentChild(
        existing,
        child,
        usedOldEls,
        parentNamespace
      );
      if (synced) return synced;
    }

    // Element child matching existing unkeyed element
    if (
      existing instanceof Element &&
      canReuseElement(existing, child, parentNamespace)
    ) {
      updateElementFromVnode(existing, child);
      usedOldEls.add(existing);
      return existing;
    }

    // Try to find available unkeyed element elsewhere
    const avail = resolveUnkeyedOnce();
    if (avail) {
      const reuseResult = tryReuseElement(
        avail,
        child,
        usedOldEls,
        parentNamespace
      );
      if (reuseResult) return reuseResult;
    }
  } catch {
    // Fall through to create new
  }

  const dom = createDOMNode(child, parentNamespace);
  return dom;
}

function isComponentVNode(child: VNode): child is ComponentVNode {
  return (
    typeof child === 'object' &&
    child !== null &&
    'type' in child &&
    typeof (child as VnodeObj).type === 'function'
  );
}

function isControlBoundaryVNode(child: VNode): child is DOMElement {
  return (
    typeof child === 'object' &&
    child !== null &&
    'type' in child &&
    (child as VnodeObj).type === __FOR_BOUNDARY__
  );
}

function prepareControlBoundaryResolution(child: VNode): {
  remount: boolean;
  vnode: VNode | null;
} | null {
  if (!isControlBoundaryVNode(child)) {
    return null;
  }

  const controlState = child._controlState ?? child._forState;
  if (!controlState) {
    return null;
  }
  if (controlState.kind === 'for') {
    const childrenVNodes = evaluateControlBoundaryChildren(controlState);
    return childrenVNodes.length === 1
      ? { remount: false, vnode: childrenVNodes[0] ?? null }
      : null;
  }

  const previousActiveKey = controlState.activeKey;
  const childrenVNodes = evaluateControlBoundaryChildren(controlState);

  return {
    remount:
      previousActiveKey !== null &&
      controlState.activeKey !== previousActiveKey,
    vnode: childrenVNodes[0] ?? null,
  };
}

function evaluateControlBoundaryChildren(
  controlState: ControlBoundaryState
): VNode[] {
  if (controlState.kind === 'for') {
    return evaluateForState(controlState);
  }

  if (controlState.kind === 'show') {
    return evaluateShowState(controlState);
  }

  return evaluateCaseState(controlState);
}

function trySyncComponentChild(
  existing: Element,
  child: VNode,
  usedOldEls: WeakSet<Node>,
  parentNamespace: string | undefined
): Node | null {
  if (!isComponentVNode(child)) return null;

  const synced = syncComponentElement(
    existing,
    child,
    child.type,
    ((child.props ?? {}) as Props) || {},
    parentNamespace
  );
  if (!synced) return null;

  usedOldEls.add(existing);
  usedOldEls.add(synced);
  return synced;
}

/** Check if existing element can be reused for child */
function canReuseElement(
  existing: Element | undefined,
  child: VNode,
  parentNamespace: string | undefined
): boolean {
  if (!existing) return false;
  if (typeof child !== 'object' || child === null || !('type' in child))
    return false;

  const childObj = child as VnodeObj;
  const existingKey = existing.getAttribute('data-key');
  const hasNoKey = existingKey === null || existingKey === undefined;

  return (
    hasNoKey &&
    typeof childObj.type === 'string' &&
    canReuseIntrinsicElementInNamespace(
      existing,
      childObj.type,
      parentNamespace
    )
  );
}

/** Collect unkeyed element children in DOM order. */
function collectUnkeyedElements(parent: Element): Element[] {
  const elements: Element[] = [];
  for (let ch = parent.firstElementChild; ch; ch = ch.nextElementSibling) {
    if (ch.getAttribute('data-key') === null) elements.push(ch);
  }
  return elements;
}

/** Try to reuse available element for child */
function tryReuseElement(
  avail: Element,
  child: VNode,
  usedOldEls: WeakSet<Node>,
  parentNamespace: string | undefined
): Node | null {
  if (typeof child === 'string' || typeof child === 'number') {
    return null;
  }

  const synced = trySyncComponentChild(
    avail,
    child,
    usedOldEls,
    parentNamespace
  );
  if (synced) {
    return synced;
  }

  if (typeof child === 'object' && child !== null && 'type' in child) {
    const childObj = child as VnodeObj;
    if (
      typeof childObj.type === 'string' &&
      canReuseIntrinsicElementInNamespace(avail, childObj.type, parentNamespace)
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
  try {
    const finalSet = new Set<Node>(finalNodes);

    for (let n = parent.firstChild; n; ) {
      const next = n.nextSibling;
      if (!finalSet.has(n)) {
        teardownNodeSubtree(n);
        parent.removeChild(n);
      }
      n = next;
    }

    for (let i = 0; i < finalNodes.length; i++) {
      const desiredNode = finalNodes[i];
      const anchor = parent.childNodes[i] ?? null;
      if (desiredNode !== anchor) {
        parent.insertBefore(desiredNode, anchor);
      }
    }
  } catch {
    const fragment = document.createDocumentFragment();
    for (let i = 0; i < finalNodes.length; i++) {
      fragment.appendChild(finalNodes[i]);
    }

    try {
      for (let n = parent.firstChild; n; ) {
        const next = n.nextSibling;
        teardownNodeSubtree(n);
        n = next;
      }
    } catch {
      // Ignore fallback cleanup failures.
    }

    recordDOMReplace('reconcile');
    parent.replaceChildren(fragment);
    return;
  }
}
