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
import {
  findRangeEnd,
  insertRangeBefore,
  moveRange,
  rangeContains,
  removeRange,
} from './dom-range';
import {
  adoptHydratedRange,
  assignScopeRange,
  getBoundaryParentNamespace,
  getBoundaryRangeHost,
  getScopeRange,
  materializeChildScopeRange,
} from './boundary-range-adoption';
import { tagNamesEqualIgnoreCase } from './utils';
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
    const hydratedRange = currentRange || !allowHydrationAdoption
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
        const nextRange: DOMRange = { start: synced, end: synced, single: true };
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
  if (node.nodeType === 8) {
    node.parentNode?.removeChild(node);
    return;
  }
  teardownNodeSubtree(node);
  node.parentNode?.removeChild(node);
}

export function syncControlBoundaryScopeNode(
  parent: Element,
  scope: ChildScope,
  vnode: VNode
): Node | null {
  const range = syncControlBoundaryScopeDom(parent, scope, vnode, null, true, false);
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
    throw new Error('[askr] For ranges require the keyed boundary commit path.');
  }
  const activeScope = controlState.activeScope;
  const activeVNode = childrenVNodes[0];
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
