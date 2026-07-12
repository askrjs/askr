import { __FOR_BOUNDARY__ } from '../common/vnode';
import { enqueueRuntimeTask } from '../runtime';
import type { ComponentFunction, ComponentInstance } from '../runtime';
import { type ControlBoundaryState } from '../runtime';
import { recordBenchEvent } from '../runtime';
import { teardownNodeSubtree } from './cleanup';
import { getRuntimeEnv } from './env';
import { commitForStateBoundaryChildren } from './for-commit';
import { keyedElements } from './keyed';
import { type DOMElement, type VNode } from './types';
import { configureBoundaryRangeHost } from './boundary-range-adoption';
import {
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
  getRangeNodes,
  insertRangeBefore,
  rangeContains,
  removeRange,
} from './dom-range';
import {
  beginLifecycleCommitBatch,
  discardLifecycleCommitBatch,
  flushLifecycleCommitBatch,
} from '../runtime';
import {
  clearControlBoundaryDomUpdateState,
  evaluateControlBoundaryState,
  getControlBoundaryCommitChildren,
  getControlBoundaryState,
} from './boundary-state';
export {
  evaluateControlBoundaryState,
  getControlBoundaryState,
  getDirectControlBoundaryVNode,
} from './boundary-state';
export { createForBoundary } from './boundary-materialization';

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
        parent.childNodes.length !==
          (nextDom.single ? 1 : getRangeNodes(nextDom).length + 2) ||
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
    if (
      currentNode?.parentNode === parent &&
      !rangeContains(nextDom, currentNode)
    ) {
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
