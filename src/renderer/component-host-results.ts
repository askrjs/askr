import { isPromiseLike } from '../common/promise';
import { isSSRPortalHydrationAnchor } from '../common/portal';
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
import { isTransparentComponentResult } from './child-shape';
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
import { markHydrationHostAdopted } from './intrinsic-hydration-adoption';
import {
  getRendererDOMHost,
  type InstanceHostElement,
  type InstanceHostNode,
} from './dom-host';
import { createDetachedRange } from './dom-range';
import { _isDOMElement, type DOMElement, type VNode } from './types';

export function retainReplacementOwnerChain(
  host: Node,
  owner: ComponentInstance,
  retainedInstances: Iterable<ComponentInstance>
): void {
  const componentHost = host as InstanceHostNode;
  const next = [...(componentHost.__ASKR_INSTANCES ?? [])];
  for (const instance of retainedInstances) {
    if (!next.includes(instance)) {
      next.push(instance);
    }
  }
  componentHost.__ASKR_INSTANCES = next;
  componentHost.__ASKR_INSTANCE = owner;
}

export function adoptEmptySSRPortalHydrationHost(
  host: InstanceHostNode,
  instance: ComponentInstance,
  retainedInstances: Iterable<ComponentInstance>,
  result: unknown
): boolean {
  if (
    !isSSRPortalHydrationAnchor(host) ||
    (result !== null && result !== undefined && result !== false)
  ) {
    return false;
  }
  const instanceHost = host as InstanceHostNode;
  instanceHost.__ASKR_INSTANCE = instance;
  instanceHost.__ASKR_INSTANCES = Array.from(
    new Set<ComponentInstance>([instance, ...retainedInstances])
  );
  instance._placeholder = instanceHost as Comment;
  mountInstanceInline(instance, null);
  retainReplacementOwnerChain(instanceHost, instance, retainedInstances);
  markHydrationHostAdopted(instanceHost);
  return true;
}

export function materializeEmptyHydrationPlaceholder(
  existingHost: InstanceHostNode,
  instance: ComponentInstance,
  retainedInstances: Iterable<ComponentInstance>,
  result: unknown,
  preserveHydrationCursor: boolean
): Comment | null {
  if (
    (!preserveHydrationCursor && !isSSRPortalHydrationAnchor(existingHost)) ||
    (result !== null && result !== undefined && result !== false)
  ) {
    return null;
  }
  const placeholder = isSSRPortalHydrationAnchor(existingHost)
    ? existingHost
    : (existingHost.ownerDocument ?? document).createComment('');
  if (placeholder !== existingHost) {
    existingHost.parentNode?.insertBefore(placeholder, existingHost);
  }
  const host = placeholder as InstanceHostNode;
  host.__ASKR_INSTANCE = instance;
  host.__ASKR_INSTANCES = [instance];
  instance._placeholder = placeholder;
  mountInstanceInline(instance, null);
  retainReplacementOwnerChain(placeholder, instance, retainedInstances);
  return placeholder;
}

export function itemInstanceHydrationComplete(host: InstanceHostElement): void {
  const instance = host.__ASKR_INSTANCE;
  const scope = (
    instance as unknown as
      | { scope?: { hydrationPending?: boolean } }
      | undefined
  )?.scope;
  if (scope) {
    scope.hydrationPending = false;
  }
}

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
  if (dom instanceof Comment) {
    const host = dom as InstanceHostNode;
    const instances = host.__ASKR_INSTANCES ?? [];
    if (!instances.includes(childInstance)) {
      instances.push(childInstance);
    }
    host.__ASKR_INSTANCES = instances;
    host.__ASKR_INSTANCE = instances[0] ?? childInstance;
    childInstance._placeholder = dom;
    mountInstanceInline(childInstance, null);
    return dom;
  }
  if (!isTransparentComponentResult(result)) {
    const host = document.createElement('div') as InstanceHostElement;
    host.appendChild(dom);
    host.__ASKR_WRAPPER_HOST = true;
    mountInstanceInline(childInstance, host);
    return host;
  }
  const materialized = createDetachedRange(dom, childInstance, true);
  const host = materialized.range.start as InstanceHostNode;
  host.__ASKR_INSTANCE = childInstance;
  host.__ASKR_INSTANCES = [childInstance];
  childInstance._placeholder = host as Comment;
  mountInstanceInline(childInstance, null);
  return materialized.fragment ?? host;
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
