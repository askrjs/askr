import { writeScopeHost } from './scope-host';
import { joinChildScopePreparation } from '../runtime/child-scope';
import type { DOMRange } from '../common/dom-range';
import {
  enterDomCommitScope,
  restoreDomCommitScope,
  type ChildScope,
  type ComponentFunction,
} from '../runtime';
import { registerCommitParticipant } from '../runtime/transaction-access';
import {
  findRangeEnd,
  insertRangeBefore,
  isRangeStart,
  removeRange,
  getRangeNodes,
  clearRangeOwner,
} from './dom-range';
import {
  adoptHydratedRange,
  assignScopeRange,
  getBoundaryParentNamespace,
  getBoundaryRangeHost,
  getRangeComponentFunction,
  getScopeRange,
  materializeChildScopeRange,
} from './boundary-range-adoption';
import { teardownBoundaryRangeNode } from './boundary-range-cleanup';
import { retireComponentOwnersForIntrinsicReuse } from './component-host-cleanup';
import { isHydrationAdoptionScopeActive } from './intrinsic-hydration-adoption';
import { tagNamesEqualIgnoreCase } from './utils';
import { _isDOMElement, type DOMElement, type VNode } from './types';
import { syncTransparentRange } from './component-fragment-range';

export function syncControlBoundaryScopeDom(
  parent: Element,
  scope: ChildScope,
  vnode: VNode,
  before: Node | null = null,
  allowHydrationAdoption = true,
  insertDetached = true
): DOMRange | null {
  joinChildScopePreparation(scope);
  const previousInstance = enterDomCommitScope(scope.componentInstance);
  try {
    const currentRange = getScopeRange(scope);
    const dom = currentRange?.single ? currentRange.start : null;
    const host = getBoundaryRangeHost();
    const componentVNode =
      _isDOMElement(vnode) && typeof vnode.type === 'function';
    const hydrationBefore =
      isHydrationAdoptionScopeActive() &&
      scope.hydrationPending &&
      !currentRange
        ? before
        : null;
    const markedHydrationEnd =
      componentVNode && hydrationBefore && isRangeStart(hydrationBefore)
        ? findRangeEnd(hydrationBefore)
        : undefined;
    const hydratedRange =
      currentRange || componentVNode || !allowHydrationAdoption
        ? null
        : adoptHydratedRange(parent, scope, before, vnode);
    if (hydratedRange) return hydratedRange;
    const resolvedRange = hydratedRange ?? currentRange;
    if (resolvedRange && scope.hydrationPending && !resolvedRange.single) {
      scope.hydrationPending = false;
      return resolvedRange;
    }
    if (componentVNode) {
      if (
        resolvedRange &&
        !resolvedRange.single &&
        !scope.needsDomUpdate &&
        getRangeComponentFunction(resolvedRange) === vnode.type
      ) {
        return resolvedRange;
      }
      const componentHost =
        resolvedRange?.start ??
        dom ??
        (hydrationBefore instanceof Element || markedHydrationEnd
          ? hydrationBefore
          : null);
      const synced = host.syncComponentElement(
        componentHost,
        vnode as DOMElement,
        vnode.type as ComponentFunction,
        ((vnode.props ?? {}) as Record<string, unknown>) || {},
        getBoundaryParentNamespace(parent),
        undefined,
        undefined,
        markedHydrationEnd
      );
      if (synced) {
        scope.hydrationPending = false;
        const ownedRange = getScopeRange(scope);
        if (ownedRange) return ownedRange;
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
      retireComponentOwnersForIntrinsicReuse(dom);
      return currentRange;
    }
    if (
      !resolvedRange.single &&
      syncTransparentRange(resolvedRange, vnode, false)
    ) {
      return resolvedRange;
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
    const previousNodes = previousRange.single
      ? [previousRange.start]
      : [
          previousRange.start,
          ...getRangeNodes(previousRange),
          previousRange.end,
        ];
    const registered = registerCommitParticipant({
      apply: () => {
        for (const node of previousNodes) node.parentNode?.removeChild(node);
      },
      settle: () => {
        const errors: unknown[] = [];
        clearRangeOwner(previousRange);
        for (const node of previousNodes) {
          try {
            teardownBoundaryRangeNode(node);
          } catch (error) {
            errors.push(error);
          }
        }
        if (errors.length)
          throw new AggregateError(errors, 'Boundary retirement failed');
      },
      rollback: () => {
        removeRange(nextRange, teardownBoundaryRangeNode);
        if (previousParent) {
          for (const node of previousNodes)
            previousParent.insertBefore(
              node,
              previousNextSibling?.parentNode === previousParent
                ? previousNextSibling
                : null
            );
        }
        writeScopeHost(scope, previousRange, previousDom);
      },
    });

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
