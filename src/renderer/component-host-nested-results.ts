import { isPromiseLike } from '../common/promise';
import type { Props } from '../common/props';
import {
  captureInlineRenderSnapshot,
  cleanupComponent,
  createComponentInstance,
  mountInstanceInline,
  renderComponentInline,
  type ComponentFunction,
  type ComponentInstance,
} from '../runtime';
import {
  getVNodeContextFrame,
  markVNodeTreeWithContextFrame,
  withContext,
  type ContextFrame,
} from '../runtime';
import {
  isTransparentComponentResult,
  normalizeComponentChildren,
} from './child-shape';
import {
  findHostInstanceByType,
  getVNodeComponentInstance,
  hasComponentOwnershipIdentity,
  inheritComponentCleanupStrict,
  isRouteRootComponentVNode,
  nextComponentInstanceId,
  restoreVNodeComponentInstance,
  setComponentOwnershipIdentity,
  setVNodeComponentInstance,
} from './component-host-instances';
import {
  cleanupProvisionalComponentInstance,
  cleanupProvisionalComponentInstances,
  registerVNodeComponentInstanceRollback,
} from './component-host-replacement';
import type { InstanceHostElement, InstanceHostNode } from './dom-host';
import { _isDOMElement, type DOMElement, type VNode } from './types';
import { assertComponentChainDepth } from './component-chain-depth';

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

export interface FreshNestedComponentEntry {
  instance: ComponentInstance;
  result: VNode;
}

export interface FreshNestedComponentResolution {
  entries: FreshNestedComponentEntry[];
  createdInstances: ComponentInstance[];
  vnodeOwners: Array<{
    node: DOMElement;
    previous: ComponentInstance | undefined;
  }>;
}

export function rollbackFreshNestedComponentResolution(
  resolution: FreshNestedComponentResolution
): void {
  for (let index = resolution.vnodeOwners.length - 1; index >= 0; index -= 1) {
    const owner = resolution.vnodeOwners[index]!;
    restoreVNodeComponentInstance(owner.node, owner.previous);
  }
  cleanupProvisionalComponentInstances(resolution.createdInstances);
}

export function resolveFreshNestedComponentResult(
  result: unknown,
  snapshot: ContextFrame | null,
  parentInstance: ComponentInstance
): FreshNestedComponentResolution {
  let currentResult = result as VNode;
  let activeSnapshot = snapshot;
  let activeParent = parentInstance;
  let depth = 0;
  const resolution: FreshNestedComponentResolution = {
    entries: [],
    createdInstances: [],
    vnodeOwners: [],
  };

  try {
    let nestedVNode = getNestedComponentVNode(currentResult);
    while (nestedVNode) {
      assertComponentChainDepth(depth, activeParent);
      const nestedSnapshot =
        getVNodeContextFrame(nestedVNode) ?? activeSnapshot;
      const componentFn = nestedVNode.type as ComponentFunction;
      const previous = getVNodeComponentInstance(nestedVNode);
      let nestedInstance =
        previous &&
        hasComponentOwnershipIdentity(
          previous,
          componentFn,
          nestedVNode,
          activeParent,
          depth
        )
          ? previous
          : undefined;
      if (!nestedInstance) {
        nestedInstance = createComponentInstance(
          nextComponentInstanceId(),
          componentFn,
          (nestedVNode.props ?? {}) as Props,
          null
        );
        resolution.vnodeOwners.push({ node: nestedVNode, previous });
        registerVNodeComponentInstanceRollback(
          nestedVNode,
          previous,
          nestedInstance
        );
        setVNodeComponentInstance(nestedVNode, nestedInstance);
        resolution.createdInstances.push(nestedInstance);
      } else {
        captureInlineRenderSnapshot(nestedInstance);
      }

      setComponentOwnershipIdentity(
        nestedInstance,
        nestedVNode,
        activeParent,
        depth
      );
      nestedInstance.isRoot = isRouteRootComponentVNode(nestedVNode);
      nestedInstance.parentInstance = activeParent;
      nestedInstance.portalScope =
        activeParent.portalScope ?? nestedInstance.portalScope;
      nestedInstance.cleanupStrict = activeParent.cleanupStrict;
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

      activeParent = nestedInstance;
      activeSnapshot = nestedSnapshot ?? null;
      currentResult = markVNodeTreeWithContextFrame(
        nextResult,
        activeSnapshot
      ) as VNode;
      resolution.entries.push({
        instance: nestedInstance,
        result: currentResult,
      });
      depth += 1;
      nestedVNode = getNestedComponentVNode(currentResult);
    }

    return resolution;
  } catch (error) {
    rollbackFreshNestedComponentResolution(resolution);
    throw error;
  }
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
    nestedInstance.parentInstance = parentInstance;
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
      nestedInstance.parentInstance = activeParent;
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
        mountInstanceInline(instance, null);
        instance._placeholder = host as Comment;
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
    nestedInstance.parentInstance = activeParent;
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
