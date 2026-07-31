import type { DOMRange } from '../common/dom-range';
import {
  clearCaseDomUpdateState,
  clearForDomUpdateState,
  clearShowDomUpdateState,
  type ControlBoundaryState,
} from '../runtime';
import {
  assignScopeRange,
  canAdoptHydratedElement,
  checkVNodeShapeChanged,
  getScopeRange,
} from './boundary-range-adoption';
import { teardownBoundaryRangeNode } from './boundary-range-cleanup';
import { syncControlBoundaryScopeDom } from './boundary-range-sync';
import { insertRangeBefore, rangeContains, removeRange } from './dom-range';
import { isHydrationAdoptionScopeActive } from './intrinsic-hydration-adoption';
import type { VNode } from './types';
import { getMaterializedKey } from './utils';

function clearBoundaryState(controlState: ControlBoundaryState): void {
  if (controlState.kind === 'for') clearForDomUpdateState(controlState);
  else if (controlState.kind === 'show') clearShowDomUpdateState(controlState);
  else clearCaseDomUpdateState(controlState);
}

export function getControlBoundaryRanges(
  controlState: ControlBoundaryState
): DOMRange[] {
  if (controlState.kind !== 'for') {
    const range = controlState.activeScope?.range;
    return range ? [range] : [];
  }
  if (controlState.orderedKeys.length === 0) {
    const range = controlState.fallbackScope
      ? getScopeRange(controlState.fallbackScope)
      : null;
    return range ? [range] : [];
  }
  return controlState.orderedKeys.flatMap((key) => {
    const scope = controlState.items.get(key)?.scope;
    const range = scope ? getScopeRange(scope) : null;
    return range ? [range] : [];
  });
}

export function syncControlBoundaryInMixedParent(
  parent: Element,
  controlState: ControlBoundaryState,
  childrenVNodes: VNode[],
  before: Node | null
): [ranges: DOMRange[], postBoundaryCursor: Node | null] {
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
      if (!item) continue;
      const range = getScopeRange(item.scope);
      if (range) collectRangeNodes(range);
    }
    if (controlState.fallbackScope) {
      const range = getScopeRange(controlState.fallbackScope);
      if (range) collectRangeNodes(range);
    }
    for (const range of controlState.lastRemovedRanges) {
      collectRangeNodes(range);
    }
    for (const node of controlState.lastRemovedNodes) {
      if (node.parentNode === parent) {
        ownedNodes.add(node);
      }
    }

    const hydrationBefore =
      before ?? (isHydrationAdoptionScopeActive() ? parent.firstChild : null);
    let afterBoundary = hydrationBefore;
    while (afterBoundary && ownedNodes.has(afterBoundary)) {
      afterBoundary = afterBoundary.nextSibling;
    }

    const nextRanges: DOMRange[] = [];
    let syncBefore = hydrationBefore;
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
    return [
      nextRanges,
      afterBoundary?.parentNode === parent ? afterBoundary : null,
    ];
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
  return [nextRange ? [nextRange] : [], nextRange?.end.nextSibling ?? null];
}
