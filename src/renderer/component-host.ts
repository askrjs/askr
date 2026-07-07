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
import { materializeKey } from './attributes';
import { normalizeComponentChildren } from './child-shape';
import {
  cleanupDetachedComponentHost,
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
  setVNodeComponentInstance,
} from './component-host-instances';
import { _isDOMElement, type DOMElement, type JSXComponent, type VNode } from './types';
import { tagNamesEqualIgnoreCase } from './utils';
export { findHostInstanceByType, inheritComponentCleanupStrict, inheritComponentKey, isRouteRootComponentVNode, nextComponentInstanceId } from './component-host-instances';
function materializeComponentResultNode(
  childInstance: ComponentInstance,
  result: unknown,
  parentNamespace?: string
): Node {
  const dom = getRendererDOMHost().createDOMNode(result, parentNamespace);

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

    const nextResult = withContext(nestedSnapshot ?? null, () =>
      renderComponentInline(nestedInstance)
    );
    cleanupComponent(nestedInstance);

    if (isPromiseLike(nextResult)) {
      throw new Error(
        'Async components are not supported. Components must return synchronously.'
      );
    }

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
  retainedHostInstances?: Iterable<ComponentInstance>
): VNode {
  let currentResult = result as VNode;
  let activeSnapshot = snapshot;
  let depth = 0;
  const retainedInstances = new Set<ComponentInstance>([retainedInstance]);
  if (retainedHostInstances) {
    for (const instance of retainedHostInstances) {
      retainedInstances.add(instance);
    }
  }
  const createdInstances: ComponentInstance[] = [];

  while (
    _isDOMElement(currentResult) &&
    typeof currentResult.type === 'function' &&
    depth < 16
  ) {
    const nestedSnapshot =
      getVNodeContextFrame(currentResult) ?? activeSnapshot;
    let nestedInstance = findHostInstanceByType(
      host,
      currentResult.type as ComponentFunction
    );
    const hadNestedInstance = !!nestedInstance;

    if (!nestedInstance) {
      nestedInstance = createComponentInstance(
        nextComponentInstanceId(),
        currentResult.type as ComponentFunction,
        ((currentResult as DOMElement).props ?? {}) as Props,
        null
      );
      createdInstances.push(nestedInstance);
    }

    if (hadNestedInstance) {
      captureInlineRenderSnapshot(nestedInstance);
    }

    setVNodeComponentInstance(currentResult, nestedInstance);
    nestedInstance.isRoot = isRouteRootComponentVNode(currentResult);
    nestedInstance.parentInstance = retainedInstance;
    nestedInstance.portalScope =
      retainedInstance.portalScope ?? nestedInstance.portalScope;
    inheritComponentCleanupStrict(nestedInstance);
    nestedInstance.props =
      (((currentResult as DOMElement).props ?? {}) as Props) || {};

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

  const previousInstances = host.__ASKR_INSTANCES ?? [];
  for (const instance of previousInstances) {
    if (!retainedInstances.has(instance)) {
      cleanupComponent(instance);
    }
  }

  const nextHostInstances = previousInstances.filter((instance) =>
    retainedInstances.has(instance)
  );
  for (const instance of retainedInstances) {
    if (instance.target === host && !nextHostInstances.includes(instance)) {
      nextHostInstances.push(instance);
    }
  }

  host.__ASKR_INSTANCES = nextHostInstances;
  host.__ASKR_INSTANCE = host.__ASKR_INSTANCES[0] ?? retainedInstance;

  for (const instance of createdInstances) {
    mountInstanceInline(instance, host);
  }

  return currentResult;
}

function resolveWrapperHostResult(
  host: InstanceHostElement,
  result: unknown,
  snapshot: ContextFrame | null
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
      currentResult.type as ComponentFunction
    );

    if (!nestedInstance) {
      break;
    }

    captureInlineRenderSnapshot(nestedInstance);

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

    warnUnusedStateReads(nestedInstance);
    activeSnapshot = nestedSnapshot ?? null;
    currentResult = nextResult;
    depth += 1;
  }

  return markVNodeTreeWithContextFrame(currentResult, activeSnapshot);
}

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
    ? findHostInstanceByType(existingHost, type)
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
    hydrationInstance.isRoot = isRouteRootComponentVNode(node);
    hydrationInstance.portalScope =
      getCurrentInstance()?.portalScope ?? hydrationInstance.portalScope;
    inheritComponentCleanupStrict(hydrationInstance);

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
      pruneComponentHostInstances(
        existingHost,
        retainedHostInstances
          ? [hydrationInstance, ...retainedHostInstances]
          : [hydrationInstance]
      );
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
      retainedHostInstances
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

    const nextDom = materializeComponentResultNode(
      hydrationInstance,
      scopedResult,
      parentNamespace
    );

    if (nextDom instanceof Element) {
      materializeKey(nextDom, node, props);
    }

    if (nextDom !== existingHost && existingHost.parentNode) {
      existingHost.parentNode.replaceChild(nextDom, existingHost);
      cleanupDetachedComponentHost(existingHost, hydrationInstance);
    }

    warnUnusedStateReads(hydrationInstance);
    return nextDom;
  }

  const snapshot =
    getVNodeContextFrame(node) ||
    getCurrentContextFrame() ||
    existingInstance.ownerFrame ||
    null;
  captureInlineRenderSnapshot(existingInstance);
  existingInstance.props = props || {};
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
      snapshot ?? null
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
    pruneComponentHostInstances(
      existingHost,
      retainedHostInstances
        ? [existingInstance, ...retainedHostInstances]
        : [existingInstance]
    );
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
    retainedHostInstances
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

  const nextDom = materializeComponentResultNode(
    existingInstance,
    scopedResult,
    parentNamespace
  );

  if (nextDom instanceof Element) {
    materializeKey(nextDom, node, props);
  }

  if (nextDom !== existingHost && existingHost.parentNode) {
    existingHost.parentNode.replaceChild(nextDom, existingHost);
    cleanupDetachedComponentHost(existingHost, existingInstance);
  }

  warnUnusedStateReads(existingInstance);
  return nextDom;
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
  if (!childInstance) {
    childInstance = createComponentInstance(
      nextComponentInstanceId(),
      componentFn as ComponentFunction,
      props || {},
      null
    );
    setVNodeComponentInstance(node, childInstance);
  }

  if (hadChildInstance) {
    captureInlineRenderSnapshot(childInstance);
  }

  childInstance.portalScope =
    getCurrentInstance()?.portalScope ?? childInstance.portalScope;
  childInstance.parentInstance = getCurrentInstance();
  childInstance.props = props || {};
  childInstance.isRoot = isRouteRootComponentVNode(node);
  inheritComponentCleanupStrict(childInstance);

  if (snapshot) {
    childInstance.ownerFrame = snapshot;
  }

  const result = withContext(snapshot, () =>
    renderComponentInline(childInstance)
  );

  if (isPromiseLike(result)) {
    throw new Error(
      'Async components are not supported. Components must return synchronously.'
    );
  }

  const scopedResult = markVNodeTreeWithContextFrame(result, snapshot ?? null);

  const dom = withContext(snapshot, () =>
    materializeComponentResultNode(childInstance, scopedResult, parentNamespace)
  );

  warnUnusedStateReads(childInstance);

  if (dom instanceof Element) {
    materializeKey(dom, node, props);
  }
  return dom;
}
