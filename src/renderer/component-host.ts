import { isPromiseLike } from '../common/promise';
import type { Props } from '../common/props';
import {
  captureInlineRenderSnapshot,
  cleanupComponent,
  createComponentInstance,
  getCurrentInstance,
  mountInstanceInline,
  renderComponentInline,
  warnUnusedStateReads,
  type ComponentFunction,
  type ComponentInstance,
} from '../runtime';
import {
  getCurrentContextFrame,
  getVNodeContextFrame,
  markVNodeTreeWithContextFrame,
  withContext,
  type ContextFrame,
} from '../runtime';
import { materializeFreshKey, materializeKey } from './attributes';
import { normalizeComponentChildren } from './child-shape';
import {
  pruneComponentHostInstances,
} from './component-host-cleanup';
import {
  getRendererDOMHost,
  type ElementWithContext,
  type InstanceHostElement,
} from './dom-host';
import {
  findHostInstanceByType,
  getVNodeComponentInstance,
  inheritComponentCleanupStrict,
  inheritComponentKey,
  isRouteRootComponentVNode,
  nextComponentInstanceId,
  restoreVNodeComponentInstance,
  setComponentOwnershipIdentity,
  setVNodeComponentInstance,
} from './component-host-instances';
import {
  _isDOMElement,
  type DOMElement,
  type JSXComponent,
  type VNode,
} from './types';
import { tagNamesEqualIgnoreCase } from './utils';
import {
  beginComponentHostReplacement,
  cleanupProvisionalComponentInstance,
  cleanupProvisionalComponentInstances,
  createRetainedHostInstanceSet,
  registerVNodeComponentInstanceRollback,
} from './component-host-replacement';
import {
  materializeComponentResultNode,
  resolveHostNestedComponentResult,
  resolveWrapperHostResult,
} from './component-host-results';
export { resolveNestedComponentResult } from './component-host-results';
export {
  findHostInstanceByType,
  inheritComponentCleanupStrict,
  inheritComponentKey,
  isRouteRootComponentVNode,
  nextComponentInstanceId,
} from './component-host-instances';

// Provisional component cleanup is owned by component-host-replacement.ts.

/* Legacy replacement body moved to component-host-replacement.ts.
function beginComponentHostReplacement(
  existingHost: InstanceHostElement,
  retainedInstance: ComponentInstance,
  previousTarget: Element | null,
  retainedInstances: Iterable<ComponentInstance> = [retainedInstance],
  disposeOnRollback = false
): ComponentHostReplacement {
  const parent = existingHost.parentNode;
  const previousRef = elementRefs.get(existingHost);
  let previousRefDetached = false;
  let nextDom: Node | null = null;
  let didReplace = false;
  let replacementAttempted = false;
  let finished = false;

  const commit = (): void => {
    if (finished) {
      return;
    }
    finished = true;
    if (replacementAttempted && didReplace) {
      cleanupDetachedComponentHost(existingHost, retainedInstances);
    }
  };

  const rollback = (): void => {
    if (finished) {
      return;
    }
    finished = true;

    if (!replacementAttempted) {
      return;
    }

    const rollbackErrors: unknown[] = [];
    if (nextDom && nextDom !== existingHost) {
      try {
        cleanupReplacementNode(nextDom, retainedInstance);
      } catch (error) {
        rollbackErrors.push(error);
      }
    }

    try {
      if (disposeOnRollback) {
        cleanupComponent(retainedInstance);
      } else {
        retainedInstance.target = previousTarget;
      }
    } catch (error) {
      rollbackErrors.push(error);
    }

    if (previousRefDetached && previousRef) {
      try {
        updateElementRef(existingHost, previousRef);
      } catch (error) {
        rollbackErrors.push(error);
      }
    }

    if (rollbackErrors.length > 0) {
      throw new AggregateError(
        rollbackErrors,
        'Component host replacement rollback failed'
      );
    }
  };

  const staged = registerLifecycleTransaction({}, commit, rollback);

  const replace = (
    materialize: () => Node,
    prepareNextDom: (replacement: Node) => void
  ): Node => {
    replacementAttempted = true;

    // Without an enclosing lifecycle batch, detach a shared old ref before the
    // new root can attach it. The transactional path gets the same ordering
    // because this teardown was registered before incoming render work.
    if (!staged && previousRef) {
      removeElementRef(existingHost);
      previousRefDetached = true;
    }

    try {
      nextDom = materialize();
      prepareNextDom(nextDom);

      if (parent && nextDom !== existingHost) {
        parent.replaceChild(nextDom, existingHost);
        didReplace = true;
      }
    } catch (error) {
      if (!staged) {
        try {
          rollback();
        } catch {
          // Preserve the original materialization error.
        }
      }
      throw error;
    }

    if (!staged) {
      commit();
    }
    return nextDom;
  };

  return { replace };
} */

/* Legacy ownership rollback moved to component-host-replacement.ts.
function registerVNodeComponentInstanceRollback(
  node: unknown,
  previousInstance: ComponentInstance | undefined,
  provisionalInstance: ComponentInstance
): void {
  let restored = false;
  const restoreOwnership = (): void => {
    if (restored) {
      return;
    }
    restored = true;
    restoreVNodeComponentInstance(node, previousInstance);
  };

  // DOM construction can fail while the new host is still inside an
  // unattached fragment. In that case no tree walk can recover this owner, so
  // make metadata restoration part of the owner lifecycle itself.
  (provisionalInstance.cleanupFns ??= []).push(restoreOwnership);
  registerLifecycleRollback(() => {
    restoreOwnership();
    cleanupProvisionalComponentInstance(provisionalInstance);
  });
} */
/* Nested result materialization moved to component-host-results.ts.
function materializeComponentResultNode(
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
      (
        placeholder as Comment & { __ASKR_INSTANCE?: ComponentInstance }
      ).__ASKR_INSTANCE = childInstance;
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

    if (nestedSnapshot) {
      nestedInstance.ownerFrame = nestedSnapshot;
    }

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

function resolveHostNestedComponentResult(
  host: InstanceHostElement,
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
        createdVNodeOwners.push({
          node: nestedVNode,
          previous: getVNodeComponentInstance(nestedVNode),
        });
        registerVNodeComponentInstanceRollback(
          nestedVNode,
          createdVNodeOwners[createdVNodeOwners.length - 1]!.previous,
          nestedInstance
        );
      }

      setComponentOwnershipIdentity(
        nestedInstance,
        nestedVNode,
        retainedInstance,
        depth
      );

      if (hadNestedInstance) {
        captureInlineRenderSnapshot(nestedInstance);
      }

      setVNodeComponentInstance(currentResult, nestedInstance);
      nestedInstance.isRoot = isRouteRootComponentVNode(currentResult);
      nestedInstance.parentInstance = retainedInstance;
      nestedInstance.portalScope =
        retainedInstance.portalScope ?? nestedInstance.portalScope;
      inheritComponentCleanupStrict(nestedInstance);
      nestedInstance.props = ((nestedVNode.props ?? {}) as Props) || {};

      if (nestedSnapshot) {
        nestedInstance.ownerFrame = nestedSnapshot;
      }

      const nextResult = withContext(nestedSnapshot ?? null, () =>
        renderComponentInline(nestedInstance)
      );

      if (isPromiseLike(nextResult)) {
        throw new Error(
          'Async components are not supported. Components must return synchronously.'
        );
      }

      retainedInstances.add(nestedInstance);
      warnUnusedStateReads(nestedInstance);
      activeSnapshot = nestedSnapshot ?? null;
      currentResult = markVNodeTreeWithContextFrame(
        nextResult,
        activeSnapshot
      ) as VNode;
      depth += 1;
    }

    for (const instance of createdInstances) {
      mountInstanceInline(instance, host);
    }
  } catch (error) {
    for (let index = createdVNodeOwners.length - 1; index >= 0; index--) {
      const owner = createdVNodeOwners[index]!;
      restoreVNodeComponentInstance(owner.node, owner.previous);
    }
    cleanupProvisionalComponentInstances(createdInstances);
    throw error;
  }

  return currentResult;
}

function resolveWrapperHostResult(
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

    if (!nestedInstance) {
      break;
    }

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

    if (nestedSnapshot) {
      nestedInstance.ownerFrame = nestedSnapshot;
    }

    const nextResult = withContext(nestedSnapshot ?? null, () =>
      renderComponentInline(nestedInstance)
    );

    if (isPromiseLike(nextResult)) {
      throw new Error(
        'Async components are not supported. Components must return synchronously.'
      );
    }

    retainedInstances.add(nestedInstance);
    warnUnusedStateReads(nestedInstance);
    activeSnapshot = nestedSnapshot ?? null;
    currentResult = nextResult;
    depth += 1;
  }

  return markVNodeTreeWithContextFrame(currentResult, activeSnapshot);
} */

export function syncComponentElement(
  currentDom: Node | null,
  node: ElementWithContext,
  type: ComponentFunction,
  props: Record<string, unknown>,
  parentNamespace?: string,
  forceChildrenUpdate = false,
  retainedHostInstances?: Iterable<ComponentInstance>
): Node | null {
  const existingHost =
    currentDom instanceof Element ? (currentDom as InstanceHostElement) : null;
  const existingInstance = existingHost
    ? findHostInstanceByType(
        existingHost,
        type,
        node,
        getCurrentInstance(),
        0
      )
    : null;
  if (!existingHost) {
    return null;
  }

  const domHost = getRendererDOMHost();

  if (!existingInstance || existingInstance.fn !== type) {
    const snapshot =
      getVNodeContextFrame(node) || getCurrentContextFrame() || null;
    const hydrationInstance = createComponentInstance(
      nextComponentInstanceId(),
      type,
      props || {},
      existingHost
    );
    setComponentOwnershipIdentity(
      hydrationInstance,
      node,
      getCurrentInstance(),
      0
    );
    hydrationInstance.isRoot = isRouteRootComponentVNode(node);
    hydrationInstance.portalScope =
      getCurrentInstance()?.portalScope ?? hydrationInstance.portalScope;
    inheritComponentCleanupStrict(hydrationInstance);

    const previousVNodeInstance = getVNodeComponentInstance(node);
    const liveRetainedInstances = createRetainedHostInstanceSet(
      hydrationInstance,
      retainedHostInstances
    );
    pruneComponentHostInstances(existingHost, liveRetainedInstances);
    const replacement = beginComponentHostReplacement(
      existingHost,
      hydrationInstance,
      hydrationInstance.target,
      liveRetainedInstances,
      true
    );

    try {
      registerVNodeComponentInstanceRollback(
        node,
        previousVNodeInstance,
        hydrationInstance
      );
      setVNodeComponentInstance(node, hydrationInstance);

      if (snapshot) {
        hydrationInstance.ownerFrame = snapshot;
      }

      const result = withContext(snapshot, () =>
        renderComponentInline(hydrationInstance)
      );
      if (isPromiseLike(result)) {
        throw new Error(
          'Async components are not supported. Components must return synchronously.'
        );
      }

      const scopedResult = markVNodeTreeWithContextFrame(
        result,
        snapshot ?? null
      );

      if (
        scopedResult &&
        typeof scopedResult === 'object' &&
        'type' in (scopedResult as DOMElement) &&
        typeof (scopedResult as DOMElement).type === 'string' &&
        tagNamesEqualIgnoreCase(
          existingHost.tagName,
          (scopedResult as DOMElement).type as string
        )
      ) {
        withContext(snapshot, () => {
          domHost.updateElementFromVnode(
            existingHost,
            inheritComponentKey(scopedResult as DOMElement, node),
            true,
            forceChildrenUpdate || hydrationInstance.mounted === false
          );
          materializeKey(existingHost, node, props);
        });
        mountInstanceInline(hydrationInstance, existingHost);
        itemInstanceHydrationComplete(existingHost);
        warnUnusedStateReads(hydrationInstance);
        return existingHost;
      }

      const resolvedResult = resolveHostNestedComponentResult(
        existingHost,
        hydrationInstance,
        scopedResult,
        snapshot ?? null,
        liveRetainedInstances
      );
      if (
        _isDOMElement(resolvedResult) &&
        typeof resolvedResult.type === 'string' &&
        tagNamesEqualIgnoreCase(existingHost.tagName, resolvedResult.type)
      ) {
        withContext(snapshot, () => {
          domHost.updateElementFromVnode(
            existingHost,
            inheritComponentKey(resolvedResult, node),
            true,
            forceChildrenUpdate || hydrationInstance.mounted === false
          );
          materializeKey(existingHost, node, props);
        });
        mountInstanceInline(hydrationInstance, existingHost);
        itemInstanceHydrationComplete(existingHost);
        warnUnusedStateReads(hydrationInstance);
        return existingHost;
      }

      const nextDom = replacement.replace(
        () =>
          materializeComponentResultNode(
            hydrationInstance,
            scopedResult,
            parentNamespace
          ),
        (replacement) => {
          if (replacement instanceof Element) {
            materializeKey(replacement, node, props);
            retainReplacementOwnerChain(
              replacement,
              hydrationInstance,
              liveRetainedInstances
            );
          }
        }
      );

      warnUnusedStateReads(hydrationInstance);
      return nextDom;
    } catch (error) {
      restoreVNodeComponentInstance(node, previousVNodeInstance);
      if (!hydrationInstance.mounted) {
        cleanupProvisionalComponentInstance(hydrationInstance);
      }
      throw error;
    }
  }

  const snapshot =
    getVNodeContextFrame(node) ||
    getCurrentContextFrame() ||
    existingInstance.ownerFrame ||
    null;
  const liveRetainedInstances = createRetainedHostInstanceSet(
    existingInstance,
    retainedHostInstances
  );
  pruneComponentHostInstances(existingHost, liveRetainedInstances);
  const replacement = beginComponentHostReplacement(
    existingHost,
    existingInstance,
    existingInstance.target,
    liveRetainedInstances
  );
  captureInlineRenderSnapshot(existingInstance);
  existingInstance.props = props || {};
  setComponentOwnershipIdentity(existingInstance, node, getCurrentInstance(), 0);
  existingInstance.isRoot = isRouteRootComponentVNode(node);
  existingInstance.portalScope =
    getCurrentInstance()?.portalScope ?? existingInstance.portalScope;
  inheritComponentCleanupStrict(existingInstance);

  if (snapshot) {
    existingInstance.ownerFrame = snapshot;
  }

  const result = withContext(snapshot, () =>
    renderComponentInline(existingInstance)
  );
  if (isPromiseLike(result)) {
    throw new Error(
      'Async components are not supported. Components must return synchronously.'
    );
  }
  const scopedResult = markVNodeTreeWithContextFrame(result, snapshot ?? null);

  if (existingHost.__ASKR_WRAPPER_HOST) {
    const wrapperResult = resolveWrapperHostResult(
      existingHost,
      scopedResult,
      snapshot ?? null,
      liveRetainedInstances
    );
    domHost.updateElementChildren(
      existingHost,
      normalizeComponentChildren(wrapperResult) as VNode[]
    );
    warnUnusedStateReads(existingInstance);
    return existingHost;
  }

  if (
    scopedResult &&
    typeof scopedResult === 'object' &&
    'type' in (scopedResult as DOMElement) &&
    typeof (scopedResult as DOMElement).type === 'string' &&
    tagNamesEqualIgnoreCase(
      existingHost.tagName,
      (scopedResult as DOMElement).type as string
    )
  ) {
    withContext(snapshot, () => {
      domHost.updateElementFromVnode(
        existingHost,
        inheritComponentKey(scopedResult as DOMElement, node),
        true,
        forceChildrenUpdate || existingInstance.mounted === false
      );
      materializeKey(existingHost, node, props);
    });
    warnUnusedStateReads(existingInstance);
    return existingHost;
  }

  const resolvedResult = resolveHostNestedComponentResult(
    existingHost,
    existingInstance,
    scopedResult,
    snapshot ?? null,
    liveRetainedInstances
  );
  if (
    _isDOMElement(resolvedResult) &&
    typeof resolvedResult.type === 'string' &&
    tagNamesEqualIgnoreCase(existingHost.tagName, resolvedResult.type)
  ) {
    withContext(snapshot, () => {
      domHost.updateElementFromVnode(
        existingHost,
        inheritComponentKey(resolvedResult, node),
        true,
        forceChildrenUpdate || existingInstance.mounted === false
      );
      materializeKey(existingHost, node, props);
    });
    warnUnusedStateReads(existingInstance);
    return existingHost;
  }

  const nextDom = replacement.replace(
    () =>
      materializeComponentResultNode(
        existingInstance,
        scopedResult,
        parentNamespace
      ),
    (replacement) => {
      if (replacement instanceof Element) {
        materializeKey(replacement, node, props);
        retainReplacementOwnerChain(
          replacement,
          existingInstance,
          liveRetainedInstances
        );
      }
    }
  );

  warnUnusedStateReads(existingInstance);
  return nextDom;
}

function retainReplacementOwnerChain(
  host: Element,
  owner: ComponentInstance,
  retainedInstances: Iterable<ComponentInstance>
): void {
  const componentHost = host as InstanceHostElement;
  const current = componentHost.__ASKR_INSTANCES ?? [];
  const next = [...current];
  for (const instance of retainedInstances) {
    if (!next.includes(instance)) {
      next.push(instance);
    }
  }
  componentHost.__ASKR_INSTANCES = next;
  componentHost.__ASKR_INSTANCE = owner;
}

function itemInstanceHydrationComplete(host: InstanceHostElement): void {
  const instance = host.__ASKR_INSTANCE;
  if (instance) {
    const scope = (
      instance as unknown as { scope?: { hydrationPending?: boolean } }
    ).scope;
    if (scope) {
      scope.hydrationPending = false;
    }
  }
}

export function createComponentElement(
  node: ElementWithContext,
  type: JSXComponent,
  props: Record<string, unknown>,
  parentNamespace?: string
): Node {
  const frame = getVNodeContextFrame(node);
  const snapshot = frame || getCurrentContextFrame();

  const componentFn = type as unknown as (props: Props) => unknown;
  const isAsync = componentFn.constructor.name === 'AsyncFunction';

  if (isAsync) {
    throw new Error(
      'Async components are not supported. Use resource() for async work.'
    );
  }

  let childInstance = getVNodeComponentInstance(node);
  const hadChildInstance = !!childInstance;
  const previousVNodeInstance = childInstance;
  if (!childInstance) {
    childInstance = createComponentInstance(
      nextComponentInstanceId(),
      componentFn as ComponentFunction,
      props || {},
      null
    );
    registerVNodeComponentInstanceRollback(
      node,
      previousVNodeInstance,
      childInstance
    );
    setVNodeComponentInstance(node, childInstance);
  }

  try {
    if (hadChildInstance) {
      captureInlineRenderSnapshot(childInstance);
    }

    childInstance.portalScope =
      getCurrentInstance()?.portalScope ?? childInstance.portalScope;
    setComponentOwnershipIdentity(
      childInstance,
      node,
      getCurrentInstance(),
      0
    );
    childInstance.parentInstance = getCurrentInstance();
    childInstance.props = props || {};
    childInstance.isRoot = isRouteRootComponentVNode(node);
    inheritComponentCleanupStrict(childInstance);

    if (snapshot) {
      childInstance.ownerFrame = snapshot;
    }

    const result = snapshot
      ? withContext(snapshot, () => renderComponentInline(childInstance))
      : renderComponentInline(childInstance);

    if (isPromiseLike(result)) {
      throw new Error(
        'Async components are not supported. Components must return synchronously.'
      );
    }

    const scopedResult = markVNodeTreeWithContextFrame(
      result,
      snapshot ?? null
    );

    const dom = snapshot
      ? withContext(snapshot, () =>
          materializeComponentResultNode(
            childInstance,
            scopedResult,
            parentNamespace
          )
        )
      : materializeComponentResultNode(
          childInstance,
          scopedResult,
          parentNamespace
        );

    warnUnusedStateReads(childInstance);

    if (dom instanceof Element) {
      materializeFreshKey(dom, node, props);
    }
    return dom;
  } catch (error) {
    if (!hadChildInstance) {
      restoreVNodeComponentInstance(node, previousVNodeInstance);
      cleanupProvisionalComponentInstance(childInstance);
    }
    throw error;
  }
}
