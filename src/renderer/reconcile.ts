/**
 * RENDERER & RECONCILIATION INVARIANTS (LOCKED)
 *
 * 1. DOM order derives only from current vnode order.
 * 2. VNode identity is not vnode stability.
 * 3. Intrinsic keyed reconciliation is element-only; component comments use
 *    their retained owner metadata.
 * 4. Primitive children map to text nodes.
 * 5. Fast paths must prove eligibility and fall back cleanly.
 * 6. Cleanup is position-independent.
 * 7. For-boundaries and keyed lists obey the same ordering rules.
 */

import type { VNode } from './types';
import { keyedElements } from './keyed';
import { buildDOMKeyMap, extractKeyedVnodes } from './keyed-children';
import { commitReconciliation } from './reconcile-commit';
import {
  findRangeAtNode,
  getLogicalChildHosts,
  getRangeNodes,
} from './dom-range';
import { tryFastPaths } from './reconcile-fastpaths';
import {
  collectUnkeyedElements,
  createOldElResolver,
  reconcileSingleChild,
} from './reconcile-resolution';

export const IS_DOM_AVAILABLE = typeof document !== 'undefined';

export function reconcileKeyedChildren(
  parent: Element,
  newChildren: VNode[],
  oldKeyMap: Map<string | number, Element> | undefined
): Map<string | number, Element> {
  const keyedVnodes = extractKeyedVnodes(newChildren);
  const ensuredOldKeyMap = oldKeyMap || buildDOMKeyMap(parent);

  const fastPathResult = tryFastPaths(
    parent,
    newChildren,
    keyedVnodes,
    ensuredOldKeyMap
  );
  if (fastPathResult) {
    return fastPathResult;
  }

  return performFullReconciliation(parent, newChildren, ensuredOldKeyMap);
}

function performFullReconciliation(
  parent: Element,
  newChildren: VNode[],
  oldKeyMap: Map<string | number, Element> | undefined
): Map<string | number, Element> {
  const newKeyMap = new Map<string | number, Element>();
  const finalNodes: Node[] = [];
  const usedOldEls = new WeakSet<Node>();
  const oldChildHosts = getLogicalChildHosts(parent);

  const resolveOldElOnce = createOldElResolver(parent, oldKeyMap, usedOldEls);
  const unkeyedEls = collectUnkeyedElements(oldChildHosts);
  let unkeyedIndex = 0;
  const resolveUnkeyedOnce = (): Element | undefined => {
    while (unkeyedIndex < unkeyedEls.length) {
      const candidate = unkeyedEls[unkeyedIndex++];
      if (!usedOldEls.has(candidate)) return candidate;
    }
    return undefined;
  };

  for (let i = 0; i < newChildren.length; i++) {
    const child = newChildren[i];
    const node = reconcileSingleChild(
      child,
      i,
      parent,
      resolveOldElOnce,
      resolveUnkeyedOnce,
      usedOldEls,
      newKeyMap,
      oldChildHosts
    );
    if (node) {
      if (node instanceof DocumentFragment) {
        finalNodes.push(...Array.from(node.childNodes));
        continue;
      }
      const range = findRangeAtNode(node);
      if (range && !range.single && range.start === node) {
        finalNodes.push(range.start, ...getRangeNodes(range), range.end);
      } else {
        finalNodes.push(node);
      }
    }
  }

  if (typeof document === 'undefined') return newKeyMap;

  commitReconciliation(parent, finalNodes);
  keyedElements.delete(parent);

  return newKeyMap;
}
