import { __FOR_BOUNDARY__ } from '../common/vnode';
import type { DOMRange } from '../common/dom-range';
import { Fragment } from '../jsx';
import { logger } from '../common/logger';
import { enqueueRuntimeTask } from '../runtime';
import type { ChildScope } from '../runtime';
import type { ComponentFunction, ComponentInstance } from '../runtime';
import {
  clearCaseDomUpdateState,
  clearShowDomUpdateState,
  evaluateCaseState,
  evaluateShowState,
  type ControlBoundaryState,
} from '../runtime';
import {
  clearForDomUpdateState,
  evaluateForState,
  recordBenchEvent,
} from '../runtime';
import { teardownNodeSubtree } from './cleanup';
import { getRuntimeEnv } from './env';
import { commitForStateBoundaryChildren } from './for-commit';
import { keyedElements } from './keyed';
import { getParentNamespace } from './namespaces';
import { _isDOMElement, type DOMElement, type VNode } from './types';
import { tagNamesEqualIgnoreCase } from './utils';
import {
  configureBoundaryRangeHost,
  materializeChildScopeRange,
  assignScopeRange,
  checkVNodeShapeChanged,
} from './boundary-range-adoption';
import {
  syncControlBoundaryInMixedParent,
  syncControlBoundaryScopeDom,
  syncControlBoundaryScopeNode,
} from './boundary-range-sync';
export {
  getControlBoundaryRanges,
  syncControlBoundaryInMixedParent,
  syncControlBoundaryScopeDom,
  syncControlBoundaryScopeNode,
} from './boundary-range-sync';
import {
  appendRange,
  createDetachedRange,
  createEmptyRange,
  createSingleNodeRange,
  getRangeNodes,
  findRangeEnd,
  insertRangeBefore,
  isRangeStart,
  rangeContains,
  removeRange,
  type DOMRange as RendererDOMRange,
} from './dom-range';
import {
  beginLifecycleCommitBatch,
  discardLifecycleCommitBatch,
  enterDomCommitScope,
  flushLifecycleCommitBatch,
  registerLifecycleTransaction,
  restoreDomCommitScope,
} from '../runtime';

type ElementWithContext = DOMElement & {
  __instance?: ComponentInstance;
};

type BoundaryCommitOwnerState = ControlBoundaryState & {
  _commitOwner?: Element | null;
};

export interface BoundaryDOMHost {
  createDOMNode(vnode: unknown, parentNamespace?: string): Node | null;
  createResultNodeWithBlueprint(
    owner: object,
    vnode: unknown,
    parentNamespace?: string
  ): Node | null;
  syncComponentElement(
    currentDom: Node | null,
    node: ElementWithContext,
    type: ComponentFunction,
    props: Record<string, unknown>,
    parentNamespace?: string,
    forceChildrenUpdate?: boolean,
    retainedHostInstances?: Iterable<ComponentInstance>
  ): Node | null;
  updateElementFromVnode(
    el: Element,
    vnode: VNode,
    updateChildren?: boolean,
    forceChildrenUpdate?: boolean
  ): void;
  tryPatchStableForDirtyItem(scope: { dom?: Node; vnode?: VNode }): boolean;
}

let boundaryDOMHost: BoundaryDOMHost | null = null;
const controlBoundaryOwners = new WeakMap<Element, ControlBoundaryState>();

export function configureBoundaryDOMHost(host: BoundaryDOMHost): void {
  boundaryDOMHost = host;
  configureBoundaryRangeHost(host);
}

function getBoundaryDOMHost(): BoundaryDOMHost {
  if (!boundaryDOMHost) {
    throw new Error('[askr] Control boundary DOM host is not configured.');
  }
  return boundaryDOMHost;
}


export function evaluateControlBoundaryState(
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

function clearControlBoundaryDomUpdateState(
  controlState: ControlBoundaryState
): void {
  if (controlState.kind === 'for') {
    clearForDomUpdateState(controlState);
    return;
  }
  if (controlState.kind === 'show') {
    clearShowDomUpdateState(controlState);
    return;
  }
  clearCaseDomUpdateState(controlState);
}

export function getControlBoundaryState(
  node: DOMElement
): ControlBoundaryState | null {
  return (
    node._controlState ??
    (node._forState as ControlBoundaryState | undefined) ??
    null
  );
}

export function getDirectControlBoundaryVNode(
  children: unknown
): DOMElement | null {
  if (
    !Array.isArray(children) &&
    _isDOMElement(children) &&
    (children as DOMElement).type === __FOR_BOUNDARY__
  ) {
    return children as DOMElement;
  }

  if (
    Array.isArray(children) &&
    children.length === 1 &&
    _isDOMElement(children[0]) &&
    (children[0] as DOMElement).type === __FOR_BOUNDARY__
  ) {
    return children[0] as DOMElement;
  }

  return null;
}

function getControlBoundaryCommitChildren(
  controlState: ControlBoundaryState
): VNode[] {
  if (controlState.kind === 'for' && controlState._needsSourceReconcile) {
    return evaluateForState(controlState);
  }

  if (controlState.kind !== 'for') {
    const activeVNode = controlState.activeScope?.vnode;
    return activeVNode == null || activeVNode === false ? [] : [activeVNode];
  }

  if (controlState.orderedKeys.length === 0) {
    const fallbackVNode = controlState.fallbackScope?.vnode;
    return fallbackVNode == null || fallbackVNode === false
      ? []
      : [fallbackVNode];
  }

  const childrenVNodes: VNode[] = [];
  for (let index = 0; index < controlState.orderedKeys.length; index += 1) {
    const itemKey = controlState.orderedKeys[index];
    const itemInstance = controlState.items.get(itemKey);
    childrenVNodes.push((itemInstance?.scope.vnode ?? null) as VNode);
  }

  return childrenVNodes;
}

export function clearControlBoundaryCommitOwner(parent: Element): void {
  const owner = controlBoundaryOwners.get(parent) as
    | BoundaryCommitOwnerState
    | undefined;
  if (owner) {
    owner._enqueueBoundaryCommit = null;
    owner._hasPendingBoundaryCommit = false;
    if (owner._commitOwner === parent) {
      owner._commitOwner = null;
    }
  }

  controlBoundaryOwners.delete(parent);
}

export function registerControlBoundaryCommitOwner(
  parent: Element,
  controlState: ControlBoundaryState
): void {
  const ownerState = controlState as BoundaryCommitOwnerState;
  const previousParent = ownerState._commitOwner;
  if (
    previousParent &&
    previousParent !== parent &&
    controlBoundaryOwners.get(previousParent) === controlState
  ) {
    controlBoundaryOwners.delete(previousParent);
  }

  const previousOwner = controlBoundaryOwners.get(parent) as
    | BoundaryCommitOwnerState
    | undefined;
  if (previousOwner && previousOwner !== controlState) {
    previousOwner._enqueueBoundaryCommit = null;
    previousOwner._hasPendingBoundaryCommit = false;
    if (previousOwner._commitOwner === parent) {
      previousOwner._commitOwner = null;
    }
  }

  controlBoundaryOwners.set(parent, controlState);
  ownerState._commitOwner = parent;
  controlState._enqueueBoundaryCommit = () => {
    if (controlState._hasPendingBoundaryCommit) {
      return;
    }

    controlState._hasPendingBoundaryCommit = true;
    enqueueRuntimeTask(() => {
      controlState._hasPendingBoundaryCommit = false;

      if (controlBoundaryOwners.get(parent) !== controlState) {
        return;
      }

      const lifecycleBatch = beginLifecycleCommitBatch();
      try {
        const childrenVNodes = getControlBoundaryCommitChildren(controlState);
        commitForBoundaryChildren(parent, controlState, childrenVNodes);
        flushLifecycleCommitBatch(lifecycleBatch);
      } catch (error) {
        discardLifecycleCommitBatch(lifecycleBatch);
        throw error;
      }
    });
  };
}

/**
 * Create DOM from For/Show/Case control boundaries.
 *
 * DOM order is reconstructed from the current vnode list on every render.
 * Reusing DOM nodes never implies preserving their position; appending an
 * existing node to the fragment expresses reordering per the DOM spec.
 */
export function createForBoundary(
  node: DOMElement,
  props: Record<string, unknown>,
  parentNamespace?: string
): DocumentFragment {
  void props;
  const controlState = getControlBoundaryState(node);

  if (!controlState) {
    if (getRuntimeEnv().NODE_ENV !== 'production') {
      logger.warn('[Askr] Control boundary missing state');
    }
    return document.createDocumentFragment();
  }

  const childrenVNodes = evaluateControlBoundaryState(controlState);
  const fragment = document.createDocumentFragment();

  if (controlState.kind !== 'for') {
    const activeScope = controlState.activeScope;
    const vnode = childrenVNodes[0];
    if (activeScope && vnode !== undefined) {
      const range = materializeChildScopeRange(
        vnode,
        parentNamespace,
        activeScope
      );
      assignScopeRange(activeScope, range);
      activeScope.hydrationPending = false;
      appendRange(fragment, range);
    }
    clearControlBoundaryDomUpdateState(controlState);
    return fragment;
  }

  const forState = controlState;
  if (forState.orderedKeys.length === 0) {
    const fallbackScope = forState.fallbackScope;
    const fallbackVNode = childrenVNodes[0];
    if (fallbackScope && fallbackVNode !== undefined) {
      const range = materializeChildScopeRange(
        fallbackVNode,
        parentNamespace,
        fallbackScope
      );
      assignScopeRange(fallbackScope, range);
      fallbackScope.hydrationPending = false;
      appendRange(fragment, range);
    }
    clearControlBoundaryDomUpdateState(controlState);
    return fragment;
  }

  for (let i = 0; i < childrenVNodes.length; i++) {
    const childVNode = childrenVNodes[i];
    const itemKey = forState.orderedKeys[i];
    const itemInstance = itemKey != null ? forState.items.get(itemKey) : null;

    let range: DOMRange | null = null;

    if (itemInstance && itemInstance.scope.range) {
      const cachedRange = itemInstance.scope.range;
      const cachedDom = cachedRange.single ? cachedRange.start : null;
      if (!cachedDom || !checkVNodeShapeChanged(cachedDom, childVNode)) {
        range = cachedRange;
      }
    }

    if (!range) {
      const materializedRange = materializeChildScopeRange(
        childVNode,
        parentNamespace,
        itemInstance?.scope
      );
      if (itemInstance) {
        assignScopeRange(itemInstance.scope, materializedRange);
        itemInstance.scope.hydrationPending = false;
      }
      range = materializedRange;
    }

    appendRange(fragment, range);
  }

  clearControlBoundaryDomUpdateState(controlState);
  return fragment;
}



export function commitForBoundaryChildren(
  parent: Element,
  controlState: ControlBoundaryState,
  childrenVNodes: VNode[]
): void {
  if (controlState.kind !== 'for') {
    const activeScope = controlState.activeScope;
    const activeVNode = childrenVNodes[0];
    const nextDom =
      activeScope && activeVNode !== undefined
        ? syncControlBoundaryScopeDom(
            parent,
            activeScope,
            activeVNode,
            parent.firstChild,
            controlState.lastRemovedRanges.length === 0
          )
        : null;

    for (const removedRange of controlState.lastRemovedRanges) {
      removeRange(removedRange, (node) => {
        if (
          !removedRange.single &&
          (node === removedRange.start || node === removedRange.end)
        ) {
          node.parentNode?.removeChild(node);
          return;
        }
        teardownNodeSubtree(node);
        node.parentNode?.removeChild(node);
      });
    }

    for (let i = 0; i < controlState.lastRemovedNodes.length; i++) {
      const removedNode = controlState.lastRemovedNodes[i];
      if (removedNode instanceof Element) {
        teardownNodeSubtree(removedNode);
      }
      if (removedNode.parentNode === parent) {
        recordBenchEvent('domRemove');
        parent.removeChild(removedNode);
      }
    }

    if (nextDom) {
      if (
        parent.childNodes.length !== (nextDom.single ? 1 : getRangeNodes(nextDom).length + 2) ||
        parent.firstChild !== nextDom.start ||
        controlState.lastRemovedNodes.length > 0 ||
        controlState.lastRemovedRanges.length > 0
      ) {
        const nodes = nextDom.single
          ? [nextDom.start]
          : [nextDom.start, ...getRangeNodes(nextDom), nextDom.end];
        parent.replaceChildren(...nodes);
      }
    } else if (parent.firstChild) {
      parent.textContent = '';
    }

    keyedElements.delete(parent);
    clearControlBoundaryDomUpdateState(controlState);
    return;
  }

  commitForStateBoundaryChildren(parent, controlState, childrenVNodes, {
    isProduction: () => getRuntimeEnv().NODE_ENV === 'production',
    syncForItemDom: syncControlBoundaryScopeNode,
    tryPatchStableForDirtyItem: (scope) =>
      getBoundaryDOMHost().tryPatchStableForDirtyItem(scope),
  });
}

export function trySyncControlBoundaryChild(
  parent: Element,
  currentNode: Node | null,
  next: DOMElement
): boolean {
  if (next.type !== __FOR_BOUNDARY__) {
    return false;
  }

  const controlState = getControlBoundaryState(next);
  if (!controlState || controlState.kind === 'for') {
    return false;
  }

  const childrenVNodes = evaluateControlBoundaryState(controlState);
  const activeScope = controlState.activeScope;
  const activeVNode = childrenVNodes[0];
  const nextDom =
    activeScope && activeVNode !== undefined
      ? syncControlBoundaryScopeDom(parent, activeScope, activeVNode)
      : null;

  for (const removedRange of controlState.lastRemovedRanges) {
    removeRange(removedRange, (node) => {
      if (
        !removedRange.single &&
        (node === removedRange.start || node === removedRange.end)
      ) {
        node.parentNode?.removeChild(node);
        return;
      }
      teardownNodeSubtree(node);
      node.parentNode?.removeChild(node);
    });
  }

  for (let i = 0; i < controlState.lastRemovedNodes.length; i++) {
    const removedNode = controlState.lastRemovedNodes[i];
    if (removedNode.parentNode !== parent) {
      continue;
    }

    teardownNodeSubtree(removedNode);
    if (
      nextDom &&
      !rangeContains(nextDom, removedNode) &&
      !nextDom.start.parentNode
    ) {
      insertRangeBefore(parent, nextDom, removedNode);
    } else {
      parent.removeChild(removedNode);
    }
  }

  if (nextDom && nextDom.start.parentNode !== parent) {
    if (currentNode?.parentNode === parent && !rangeContains(nextDom, currentNode)) {
      teardownNodeSubtree(currentNode);
      insertRangeBefore(parent, nextDom, currentNode);
      currentNode.parentNode?.removeChild(currentNode);
    } else {
      insertRangeBefore(parent, nextDom);
    }
  } else if (!nextDom && currentNode?.parentNode === parent) {
    teardownNodeSubtree(currentNode);
    parent.removeChild(currentNode);
  }

  clearControlBoundaryDomUpdateState(controlState);
  return true;
}
