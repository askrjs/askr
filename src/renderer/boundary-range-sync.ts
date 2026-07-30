import type { DOMRange } from '../common/dom-range';
import {
  clearCaseDomUpdateState,
  clearForDomUpdateState,
  clearShowDomUpdateState,
  enterDomCommitScope,
  registerLifecycleTransaction,
  restoreDomCommitScope,
  type ChildScope,
  type ComponentFunction,
  type ControlBoundaryState,
} from '../runtime';
import { teardownNodeSubtree } from './cleanup';
import { insertRangeBefore, rangeContains, removeRange } from './dom-range';
import {
  adoptHydratedRange,
  assignScopeRange,
  canAdoptHydratedElement,
  checkVNodeShapeChanged,
  getBoundaryParentNamespace,
  getBoundaryRangeHost,
  getScopeRange,
  materializeChildScopeRange,
} from './boundary-range-adoption';
import { isHydrationAdoptionScopeActive } from './intrinsic-hydration-adoption';
import { getMaterializedKey, tagNamesEqualIgnoreCase } from './utils';
import { _isDOMElement, type DOMElement, type VNode } from './types';

function clearBoundaryState(controlState: ControlBoundaryState): void {
  if (controlState.kind === 'for') clearForDomUpdateState(controlState);
  else if (controlState.kind === 'show') clearShowDomUpdateState(controlState);
  else clearCaseDomUpdateState(controlState);
}

export function syncControlBoundaryScopeDom(
  parent: Element,
  scope: ChildScope,
  vnode: VNode,
  before: Node | null = null,
  allowHydrationAdoption = true,
  insertDetached = true
): DOMRange | null {
  const previousInstance = enterDomCommitScope(scope.componentInstance);
  try {
    const currentRange = getScopeRange(scope);
    const dom = currentRange?.single ? currentRange.start : null;
    const host = getBoundaryRangeHost();
    const hydratedRange =
      currentRange || !allowHydrationAdoption
        ? null
        : adoptHydratedRange(parent, scope, before, vnode);
    if (hydratedRange) return hydratedRange;
    const resolvedRange = hydratedRange ?? currentRange;
    if (resolvedRange && scope.hydrationPending && !resolvedRange.single) {
      scope.hydrationPending = false;
      return resolvedRange;
    }

    if (_isDOMElement(vnode) && typeof vnode.type === 'function') {
      const synced = host.syncComponentElement(
        dom,
        vnode as DOMElement,
        vnode.type as ComponentFunction,
        ((vnode.props ?? {}) as Record<string, unknown>) || {},
        getBoundaryParentNamespace(parent)
      );
      if (synced) {
        const nextRange: DOMRange = {
          start: synced,
          end: synced,
          single: true,
        };
        assignScopeRange(scope, nextRange);
        return nextRange;
      }
    }

    if (!resolvedRange) {
      const nextRange = materializeChildScopeRange(
        vnode,
        getBoundaryParentNamespace(parent),
        scope,
        true
      );
      assignScopeRange(scope, nextRange);
      scope.hydrationPending = false;
      if (insertDetached) insertRangeBefore(parent, nextRange, before);
      return nextRange;
    }

    if (
      resolvedRange.single &&
      dom?.nodeType === 3 &&
      (typeof vnode === 'string' || typeof vnode === 'number')
    ) {
      (dom as Text).data = String(vnode);
      return currentRange;
    }
    if (
      resolvedRange.single &&
      dom?.nodeType === 8 &&
      (vnode === null || vnode === undefined || vnode === false)
    ) {
      return currentRange;
    }
    if (
      resolvedRange.single &&
      dom instanceof Element &&
      _isDOMElement(vnode) &&
      typeof vnode.type === 'string' &&
      tagNamesEqualIgnoreCase(dom.tagName, vnode.type)
    ) {
      host.updateElementFromVnode(dom, vnode, true);
      return currentRange;
    }

    const nextRange = materializeChildScopeRange(
      vnode,
      getBoundaryParentNamespace(parent),
      scope
    );
    const previousRange = resolvedRange;
    const previousDom = scope.dom;
    const previousParent = previousRange.start.parentNode;
    const previousNextSibling = previousRange.end.nextSibling;
    const registered = registerLifecycleTransaction(
      {},
      () => removeRange(previousRange, teardownBoundaryRangeNode),
      () => {
        removeRange(nextRange, teardownBoundaryRangeNode);
        if (previousParent && !previousRange.start.parentNode) {
          previousParent.insertBefore(
            previousRange.start,
            previousNextSibling?.parentNode === previousParent
              ? previousNextSibling
              : null
          );
        }
        scope.range = previousRange;
        scope.dom = previousDom;
      }
    );

    if (
      previousRange.single &&
      nextRange.single &&
      previousRange.start.parentNode === parent
    ) {
      parent.replaceChild(nextRange.start, previousRange.start);
    } else {
      insertRangeBefore(
        parent,
        nextRange,
        previousRange.start.parentNode === parent ? previousRange.start : null
      );
    }
    assignScopeRange(scope, nextRange);
    if (!registered) removeRange(previousRange, teardownBoundaryRangeNode);
    return nextRange;
  } finally {
    restoreDomCommitScope(previousInstance);
  }
}

function teardownBoundaryRangeNode(node: Node): void {
  // Range anchors are metadata-free comments, but an interior comment can be
  // the host for a null component. Teardown is cheap for anchors and required
  // for component-host comments, so every removed range node follows the same
  // ownership path.
  teardownNodeSubtree(node);
  node.parentNode?.removeChild(node);
}

export function syncControlBoundaryScopeNode(
  parent: Element,
  scope: ChildScope,
  vnode: VNode
): Node | null {
  const range = syncControlBoundaryScopeDom(
    parent,
    scope,
    vnode,
    null,
    true,
    false
  );
  return range?.single ? range.start : null;
}

export function getControlBoundaryRanges(
  controlState: ControlBoundaryState
): DOMRange[] {
  if (controlState.kind !== 'for') {
    const range = controlState.activeScope?.range;
    return range ? [range] : [];
  }
  if (controlState.orderedKeys.length === 0) {
    const range = controlState.fallbackScope?.range;
    return range ? [range] : [];
  }
  return controlState.orderedKeys.flatMap((key) => {
    const range = controlState.items.get(key)?.scope.range;
    return range ? [range] : [];
  });
}

export function syncControlBoundaryInMixedParent(
  parent: Element,
  controlState: ControlBoundaryState,
  childrenVNodes: VNode[],
  before: Node | null
): DOMRange[] {
  if (controlState.kind === 'for') {
    const ownedNodes = new Set<Node>();
    const collectRangeNodes = (range: DOMRange): void => {
      if (range.start.parentNode !== parent) {
        return;
      }
      ownedNodes.add(range.start);
      if (!range.single) {
        let current = range.start.nextSibling;
        while (current) {
          ownedNodes.add(current);
          if (current === range.end) {
            break;
          }
          current = current.nextSibling;
        }
      }
    };

    for (const item of controlState.orderedItems) {
      if (item?.scope.range) {
        collectRangeNodes(item.scope.range);
      }
    }
    if (controlState.fallbackScope?.range) {
      collectRangeNodes(controlState.fallbackScope.range);
    }
    for (const range of controlState.lastRemovedRanges) {
      collectRangeNodes(range);
    }
    for (const node of controlState.lastRemovedNodes) {
      if (node.parentNode === parent) {
        ownedNodes.add(node);
      }
    }

    let afterBoundary = before;
    while (afterBoundary && ownedNodes.has(afterBoundary)) {
      afterBoundary = afterBoundary.nextSibling;
    }

    const nextRanges: DOMRange[] = [];
    let syncBefore = before;
    if (controlState.orderedKeys.length === 0) {
      const fallbackScope = controlState.fallbackScope;
      const fallbackVNode = childrenVNodes[0];
      if (fallbackScope && fallbackVNode !== undefined) {
        if (
          isHydrationAdoptionScopeActive() &&
          fallbackScope.hydrationPending &&
          !fallbackScope.range &&
          syncBefore instanceof Element &&
          !checkVNodeShapeChanged(syncBefore, fallbackVNode)
        ) {
          assignScopeRange(fallbackScope, {
            start: syncBefore,
            end: syncBefore,
            single: true,
          });
          fallbackScope.hydrationPending = false;
        }
        const range = syncControlBoundaryScopeDom(
          parent,
          fallbackScope,
          fallbackVNode,
          syncBefore,
          controlState.lastRemovedRanges.length === 0,
          false
        );
        if (range) {
          nextRanges.push(range);
          syncBefore = range.end.nextSibling;
        }
      }
    } else {
      for (
        let index = 0;
        index < controlState.orderedItems.length;
        index += 1
      ) {
        const item = controlState.orderedItems[index];
        const vnode = childrenVNodes[index];
        if (!item || vnode === undefined) {
          continue;
        }
        if (
          isHydrationAdoptionScopeActive() &&
          item.scope.hydrationPending &&
          !item.scope.range &&
          syncBefore instanceof Element &&
          getMaterializedKey(syncBefore) === controlState.orderedKeys[index] &&
          canAdoptHydratedElement(syncBefore, vnode)
        ) {
          assignScopeRange(item.scope, {
            start: syncBefore,
            end: syncBefore,
            single: true,
          });
          item.scope.hydrationPending = false;
        }
        const range = syncControlBoundaryScopeDom(
          parent,
          item.scope,
          vnode,
          syncBefore,
          controlState.lastRemovedRanges.length === 0,
          false
        );
        if (range) {
          nextRanges.push(range);
          syncBefore = range.end.nextSibling;
        }
      }
    }

    const previousAfterBoundary = afterBoundary;
    if (
      previousAfterBoundary &&
      nextRanges.some((range) => rangeContains(range, previousAfterBoundary))
    ) {
      afterBoundary =
        nextRanges[nextRanges.length - 1]?.end.nextSibling ?? null;
    }

    const nextRangeSet = new Set(nextRanges);
    for (const range of controlState.lastRemovedRanges) {
      if (!nextRangeSet.has(range)) {
        removeRange(range, teardownBoundaryRangeNode);
      }
    }
    for (const node of controlState.lastRemovedNodes) {
      if (
        node.parentNode === parent &&
        !nextRanges.some((range) => rangeContains(range, node))
      ) {
        teardownBoundaryRangeNode(node);
      }
    }

    let anchor = afterBoundary?.parentNode === parent ? afterBoundary : null;
    for (let index = nextRanges.length - 1; index >= 0; index -= 1) {
      const range = nextRanges[index]!;
      insertRangeBefore(parent, range, anchor);
      anchor = range.start;
    }

    clearBoundaryState(controlState);
    return nextRanges;
  }
  const activeScope = controlState.activeScope;
  const activeVNode = childrenVNodes[0];
  if (
    isHydrationAdoptionScopeActive() &&
    activeScope?.hydrationPending &&
    activeVNode !== undefined &&
    !activeScope.range &&
    controlState.lastRemovedRanges.length === 0 &&
    before instanceof Element &&
    canAdoptHydratedElement(before, activeVNode)
  ) {
    assignScopeRange(activeScope, {
      start: before,
      end: before,
      single: true,
    });
    activeScope.hydrationPending = false;
  }
  const nextRange =
    activeScope && activeVNode !== undefined
      ? syncControlBoundaryScopeDom(
          parent,
          activeScope,
          activeVNode,
          before,
          controlState.lastRemovedRanges.length === 0
        )
      : null;

  for (const range of controlState.lastRemovedRanges) {
    if (range !== nextRange) removeRange(range, teardownBoundaryRangeNode);
  }
  for (const node of controlState.lastRemovedNodes) {
    if (node.parentNode === parent) teardownBoundaryRangeNode(node);
  }
  clearBoundaryState(controlState);
  return nextRange ? [nextRange] : [];
}

export function removeBoundaryRange(range: DOMRange): void {
  removeRange(range, teardownBoundaryRangeNode);
}
