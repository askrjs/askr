import { isPromiseLike } from '../common/promise';
import type { Props } from '../common/props';
import {
  captureInlineRenderSnapshot,
  cleanupComponent,
  createComponentInstance,
  getCurrentInstance,
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
  cleanupProvisionalComponentInstance,
  cleanupProvisionalComponentInstances,
  registerVNodeComponentInstanceRollback,
} from './component-host-replacement';
import {
  findHostInstanceByType,
  getVNodeComponentInstance,
  inheritComponentCleanupStrict,
  isRouteRootComponentVNode,
  nextComponentInstanceId,
  restoreVNodeComponentInstance,
  setComponentOwnershipIdentity,
  setVNodeComponentInstance,
} from './component-host-instances';
import {
  getRendererDOMHost,
  type InstanceHostElement,
  type InstanceHostNode,
} from './dom-host';
import { _isDOMElement, type DOMElement, type VNode } from './types';

export function materializeComponentResultNode(
  childInstance: ComponentInstance,
  result: unknown,
  parentNamespace?: string
): Node {
  const dom = getRendererDOMHost().createComponentResultNode(
    childInstance.fn,
    result,
    parentNamespace
  );
  if (dom instanceof Element) {
    mountInstanceInline(childInstance, dom);
    return dom;
  }
  if (!dom) {
    const placeholder = document.createComment('');
    try {
      const host = placeholder as InstanceHostNode;
      host.__ASKR_INSTANCE = childInstance;
      host.__ASKR_INSTANCES = [childInstance];
    } catch {
      // Ignore placeholder metadata failures.
    }
    childInstance._placeholder = placeholder;
    mountInstanceInline(childInstance, null);
    return placeholder;
  }
  const host = document.createElement('div') as InstanceHostElement;
  host.appendChild(dom);
  host.__ASKR_WRAPPER_HOST = true;
  mountInstanceInline(childInstance, host);
  return host;
}

export function resolveNestedComponentResult(
  result: unknown,
  snapshot: ContextFrame | null,
  parentInstance: ComponentInstance | null
): VNode {
  let currentResult = result as VNode;
  let activeSnapshot = snapshot;
  let depth = 0;
  while (
    _isDOMElement(currentResult) &&
    typeof currentResult.type === 'function' &&
    depth < 16
  ) {
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
): VNode {
  let currentResult = result as VNode;
  let activeSnapshot = snapshot;
  let depth = 0;
  const createdInstances: ComponentInstance[] = [];
  const createdVNodeOwners: Array<{
    node: DOMElement;
    previous: ComponentInstance | undefined;
  }> = [];

  try {
    while (
      _isDOMElement(currentResult) &&
      typeof currentResult.type === 'function' &&
      depth < 16
    ) {
      const nestedVNode = currentResult as DOMElement;
      const nestedSnapshot =
        getVNodeContextFrame(currentResult) ?? activeSnapshot;
      let nestedInstance = findHostInstanceByType(
        host,
        currentResult.type as ComponentFunction,
        nestedVNode,
        retainedInstance,
        depth
      );
      const hadNestedInstance = !!nestedInstance;

      if (!nestedInstance) {
        nestedInstance = createComponentInstance(
          nextComponentInstanceId(),
          currentResult.type as ComponentFunction,
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
        retainedInstance,
        depth
      );
      if (hadNestedInstance) captureInlineRenderSnapshot(nestedInstance);
      setVNodeComponentInstance(currentResult, nestedInstance);
      nestedInstance.isRoot = isRouteRootComponentVNode(currentResult);
      nestedInstance.parentInstance = retainedInstance;
      nestedInstance.portalScope =
        retainedInstance.portalScope ?? nestedInstance.portalScope;
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
      activeSnapshot = nestedSnapshot ?? null;
      currentResult = markVNodeTreeWithContextFrame(
        nextResult,
        activeSnapshot
      ) as VNode;
      depth += 1;
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
  return currentResult;
}

export function resolveWrapperHostResult(
  host: InstanceHostElement,
  result: unknown,
  snapshot: ContextFrame | null,
  retainedInstances: Set<ComponentInstance>
): unknown {
  let currentResult = result;
  let activeSnapshot = snapshot;
  let depth = 0;
  while (
    _isDOMElement(currentResult) &&
    typeof currentResult.type === 'function' &&
    depth < 16
  ) {
    const nestedSnapshot =
      getVNodeContextFrame(currentResult) ?? activeSnapshot;
    const nestedInstance = findHostInstanceByType(
      host,
      currentResult.type as ComponentFunction,
      currentResult,
      getCurrentInstance(),
      depth
    );
    if (!nestedInstance) break;

    captureInlineRenderSnapshot(nestedInstance);
    setComponentOwnershipIdentity(
      nestedInstance,
      currentResult,
      getCurrentInstance(),
      depth
    );
    nestedInstance.props =
      (((currentResult as DOMElement).props ?? {}) as Props) || {};
    nestedInstance.parentInstance = getCurrentInstance();
    nestedInstance.isRoot = isRouteRootComponentVNode(currentResult);
    nestedInstance.portalScope =
      getCurrentInstance()?.portalScope ?? nestedInstance.portalScope;
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
    activeSnapshot = nestedSnapshot ?? null;
    currentResult = nextResult;
    depth += 1;
  }
  return markVNodeTreeWithContextFrame(currentResult, activeSnapshot);
}
