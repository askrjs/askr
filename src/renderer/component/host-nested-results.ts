import { isPromiseLike } from '../../common/promise';
import type { Props } from '../../common/props';
import {
  captureInlineRenderSnapshot,
  cleanupComponent,
  createComponentInstance,
  mountInstanceInline,
  renderComponentInline,
  type ComponentFunction,
  type ComponentInstance,
} from '../../runtime';
import {
  getVNodeContextFrame,
  markVNodeTreeWithContextFrame,
  withContext,
  type ContextFrame,
} from '../../runtime';
import {
  isTransparentComponentResult,
  normalizeComponentChildren,
} from '../children/child-shape';
import {
  findHostInstanceByType,
  getVNodeComponentInstance,
  inheritComponentCleanupStrict,
  isRouteRootComponentVNode,
  nextComponentInstanceId,
  restoreVNodeComponentInstance,
  setComponentOwnershipIdentity,
  setVNodeComponentInstance,
} from './host-instances';
import {
  cleanupProvisionalComponentInstance,
  cleanupProvisionalComponentInstances,
  registerVNodeComponentInstanceRollback,
} from './host-replacement';
import type { InstanceHostElement, InstanceHostNode } from '../dom-host';
import { _isDOMElement, type DOMElement, type VNode } from '../types';
import { assertComponentChainDepth } from './chain-depth';

function getNestedComponentVNode(result: unknown): DOMElement | null {
  if (_isDOMElement(result) && typeof result.type === 'function') {
    return result;
  }
  if (!isTransparentComponentResult(result)) {
    return null;
  }
  const children = normalizeComponentChildren(result);
  const child = children.length === 1 ? children[0] : undefined;
  return _isDOMElement(child) && typeof child.type === 'function'
    ? child
    : null;
}

export function resolveNestedComponentResult(
  result: unknown,
  snapshot: ContextFrame | null,
  parentInstance: ComponentInstance | null
): VNode {
  let currentResult = result as VNode;
  let activeSnapshot = snapshot;
  let diagnosticParent = parentInstance;
  let depth = 0;
  while (
    _isDOMElement(currentResult) &&
    typeof currentResult.type === 'function'
  ) {
    assertComponentChainDepth(depth, diagnosticParent);
    const nestedSnapshot =
      getVNodeContextFrame(currentResult) ?? activeSnapshot;
    const nestedInstance = createComponentInstance(
      nextComponentInstanceId(),
      currentResult.type as ComponentFunction,
      ((currentResult as DOMElement).props ?? {}) as Props,
      null
    );
    nestedInstance.isRoot = isRouteRootComponentVNode(currentResult);

    nestedInstance.portalScope =
      parentInstance?.portalScope ?? nestedInstance.portalScope;
    inheritComponentCleanupStrict(nestedInstance);
    if (nestedSnapshot) nestedInstance.ownerFrame = nestedSnapshot;

    let nextResult: unknown;
    try {
      nextResult = withContext(nestedSnapshot ?? null, () =>
        renderComponentInline(nestedInstance)
      );
      if (isPromiseLike(nextResult)) {
        throw new Error(
          'Async components are not supported. Components must return synchronously.'
        );
      }
    } catch (error) {
      cleanupProvisionalComponentInstance(nestedInstance);
      throw error;
    }
    cleanupComponent(nestedInstance);
    diagnosticParent = nestedInstance;
    activeSnapshot = nestedSnapshot ?? null;
    currentResult = nextResult as VNode;
    depth += 1;
  }
  return currentResult;
}

export function resolveHostNestedComponentResult(
  host: InstanceHostNode,
  retainedInstance: ComponentInstance,
  result: unknown,
  snapshot: ContextFrame | null,
  retainedInstances: Set<ComponentInstance>
): { result: VNode; owner: ComponentInstance } {
  let currentResult = result as VNode;
  let activeSnapshot = snapshot;
  let activeParent = retainedInstance;
  let depth = 0;
  const createdInstances: ComponentInstance[] = [];
  const createdVNodeOwners: Array<{
    node: DOMElement;
    previous: ComponentInstance | undefined;
  }> = [];

  try {
    let nestedVNode = getNestedComponentVNode(currentResult);
    while (nestedVNode) {
      assertComponentChainDepth(depth, activeParent);
      const nestedSnapshot =
        getVNodeContextFrame(nestedVNode) ?? activeSnapshot;
      let nestedInstance = findHostInstanceByType(
        host,
        nestedVNode.type as ComponentFunction,
        nestedVNode,
        activeParent,
        depth
      );
      const hadNestedInstance = !!nestedInstance;

      if (!nestedInstance) {
        nestedInstance = createComponentInstance(
          nextComponentInstanceId(),
          nestedVNode.type as ComponentFunction,
          (nestedVNode.props ?? {}) as Props,
          null
        );
        createdInstances.push(nestedInstance);
        const previous = getVNodeComponentInstance(nestedVNode);
        createdVNodeOwners.push({ node: nestedVNode, previous });
        registerVNodeComponentInstanceRollback(
          nestedVNode,
          previous,
          nestedInstance
        );
      }

      setComponentOwnershipIdentity(
        nestedInstance,
        nestedVNode,
        activeParent,
        depth
      );
      if (hadNestedInstance) captureInlineRenderSnapshot(nestedInstance);
      setVNodeComponentInstance(nestedVNode, nestedInstance);
      nestedInstance.isRoot = isRouteRootComponentVNode(nestedVNode);

      nestedInstance.portalScope =
        activeParent.portalScope ?? nestedInstance.portalScope;
      inheritComponentCleanupStrict(nestedInstance);
      nestedInstance.props = ((nestedVNode.props ?? {}) as Props) || {};
      if (nestedSnapshot) nestedInstance.ownerFrame = nestedSnapshot;

      const nextResult = withContext(nestedSnapshot ?? null, () =>
        renderComponentInline(nestedInstance)
      );
      if (isPromiseLike(nextResult)) {
        throw new Error(
          'Async components are not supported. Components must return synchronously.'
        );
      }

      retainedInstances.add(nestedInstance);
      activeParent = nestedInstance;
      activeSnapshot = nestedSnapshot ?? null;
      currentResult = markVNodeTreeWithContextFrame(
        nextResult,
        activeSnapshot
      ) as VNode;
      depth += 1;
      nestedVNode = getNestedComponentVNode(currentResult);
    }

    for (const instance of createdInstances) {
      if (host instanceof Element) {
        instance._placeholder = undefined;
        mountInstanceInline(instance, host);
      } else {
        instance._placeholder = host as Comment;
        mountInstanceInline(instance, null);
      }
    }
  } catch (error) {
    for (let index = createdVNodeOwners.length - 1; index >= 0; index -= 1) {
      const owner = createdVNodeOwners[index]!;
      restoreVNodeComponentInstance(owner.node, owner.previous);
    }
    cleanupProvisionalComponentInstances(createdInstances);
    throw error;
  }
  return { result: currentResult, owner: activeParent };
}

export function resolveWrapperHostResult(
  host: InstanceHostElement,
  retainedInstance: ComponentInstance,
  result: unknown,
  snapshot: ContextFrame | null,
  retainedInstances: Set<ComponentInstance>
): { result: unknown; owner: ComponentInstance } {
  let currentResult = result;
  let activeSnapshot = snapshot;
  let activeParent = retainedInstance;
  let depth = 0;
  let nestedVNode = getNestedComponentVNode(currentResult);
  while (nestedVNode) {
    assertComponentChainDepth(depth, activeParent);
    const nestedSnapshot = getVNodeContextFrame(nestedVNode) ?? activeSnapshot;
    const nestedInstance = findHostInstanceByType(
      host,
      nestedVNode.type as ComponentFunction,
      nestedVNode,
      activeParent,
      depth
    );
    if (!nestedInstance) break;

    captureInlineRenderSnapshot(nestedInstance);
    setComponentOwnershipIdentity(
      nestedInstance,
      nestedVNode,
      activeParent,
      depth
    );
    nestedInstance.props =
      (((nestedVNode as DOMElement).props ?? {}) as Props) || {};

    nestedInstance.isRoot = isRouteRootComponentVNode(nestedVNode);
    nestedInstance.portalScope =
      activeParent.portalScope ?? nestedInstance.portalScope;
    inheritComponentCleanupStrict(nestedInstance);
    if (nestedSnapshot) nestedInstance.ownerFrame = nestedSnapshot;

    const nextResult = withContext(nestedSnapshot ?? null, () =>
      renderComponentInline(nestedInstance)
    );
    if (isPromiseLike(nextResult)) {
      throw new Error(
        'Async components are not supported. Components must return synchronously.'
      );
    }
    retainedInstances.add(nestedInstance);
    activeParent = nestedInstance;
    activeSnapshot = nestedSnapshot ?? null;
    currentResult = markVNodeTreeWithContextFrame(nextResult, activeSnapshot);
    depth += 1;
    nestedVNode = getNestedComponentVNode(currentResult);
  }
  return {
    result: markVNodeTreeWithContextFrame(currentResult, activeSnapshot),
    owner: activeParent,
  };
}
