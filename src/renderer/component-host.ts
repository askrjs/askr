import { isPromiseLike } from '../common/promise';
import type { Props } from '../common/props';
import { isSSRPortalHydrationAnchor } from '../common/portal';
import {
  captureInlineRenderSnapshot,
  createComponentInstance,
  getCurrentInstance,
  mountInstanceInline,
  renderComponentInline,
  type ComponentFunction,
  type ComponentInstance,
} from '../runtime';
import {
  getCurrentContextFrame,
  getVNodeContextFrame,
  markVNodeTreeWithContextFrame,
  withContext,
} from '../runtime';
import { materializeFreshKey, materializeKey } from './attributes';
import {
  isTransparentComponentRangeResult,
  normalizeComponentChildren,
} from './child-shape';
import {
  adoptHydratedComponentRange,
  syncComponentFragmentRange,
} from './component-fragment-range';
import { pruneComponentHostInstances } from './component-host-cleanup';
import {
  getRendererDOMHost,
  type ElementWithContext,
  type InstanceHostElement,
  type InstanceHostNode,
} from './dom-host';
import {
  findHostInstanceByType,
  findStableHostInstanceByType,
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
import { canReconcileComponentHost } from './intrinsic-hydration-adoption';
import { tagNamesEqualIgnoreCase } from './utils';
import {
  beginComponentHostReplacement,
  cleanupProvisionalComponentInstance,
  createRetainedHostInstanceSet,
  registerVNodeComponentInstanceRollback,
} from './component-host-replacement';
import {
  adoptEmptySSRPortalHydrationHost,
  itemInstanceHydrationComplete,
  materializeComponentResultNode,
  materializeEmptyHydrationPlaceholder,
  retainReplacementOwnerChain,
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
export function syncComponentElement(
  currentDom: Node | null,
  node: ElementWithContext,
  type: ComponentFunction,
  props: Record<string, unknown>,
  parentNamespace?: string,
  forceChildrenUpdate = false,
  retainedHostInstances?: Iterable<ComponentInstance>,
  hydrationRangeEnd?: Node | null,
  preserveHydrationCursorOnEmpty = false
): Node | null {
  const existingHost =
    currentDom instanceof Element || currentDom instanceof Comment
      ? (currentDom as InstanceHostNode)
      : null;
  const existingInstance = existingHost
    ? existingHost instanceof Comment
      ? findStableHostInstanceByType(
          existingHost,
          type,
          node,
          getCurrentInstance(),
          0
        )
      : findHostInstanceByType(
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

  if (!canReconcileComponentHost(existingHost, Boolean(existingInstance)))
    return null;

  const domHost = getRendererDOMHost();

  if (!existingInstance || existingInstance.fn !== type) {
    if (
      !(existingHost instanceof Element) &&
      !isSSRPortalHydrationAnchor(existingHost)
    ) {
      return null;
    }
    const snapshot =
      getVNodeContextFrame(node) || getCurrentContextFrame() || null;
    const hydrationInstance = createComponentInstance(
      nextComponentInstanceId(),
      type,
      props || {},
      existingHost instanceof Element ? existingHost : null
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

      const emptyPlaceholder = materializeEmptyHydrationPlaceholder(
        existingHost,
        hydrationInstance,
        liveRetainedInstances,
        scopedResult,
        preserveHydrationCursorOnEmpty
      );
      if (emptyPlaceholder) {
        return emptyPlaceholder;
      }

      if (
        hydrationRangeEnd !== undefined &&
        isTransparentComponentRangeResult(scopedResult)
      ) {
        const adoptedHost = adoptHydratedComponentRange(
          existingHost,
          hydrationInstance,
          scopedResult,
          hydrationRangeEnd,
          forceChildrenUpdate || hydrationInstance.mounted === false,
          liveRetainedInstances
        );
        if (adoptedHost) {
          return adoptedHost;
        }
      }

      if (
        existingHost instanceof Element &&
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
        adoptEmptySSRPortalHydrationHost(
          existingHost,
          hydrationInstance,
          liveRetainedInstances,
          resolvedResult
        )
      ) {
        return existingHost;
      }
      if (
        hydrationRangeEnd !== undefined &&
        isTransparentComponentRangeResult(resolvedResult)
      ) {
        const adoptedHost = adoptHydratedComponentRange(
          existingHost,
          hydrationInstance,
          resolvedResult,
          hydrationRangeEnd,
          forceChildrenUpdate || hydrationInstance.mounted === false,
          liveRetainedInstances
        );
        if (adoptedHost) {
          return adoptedHost;
        }
      }
      if (
        existingHost instanceof Element &&
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
          }
          retainReplacementOwnerChain(
            replacement,
            hydrationInstance,
            liveRetainedInstances
          );
        }
      );

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
  setComponentOwnershipIdentity(
    existingInstance,
    node,
    getCurrentInstance(),
    0
  );
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

  if (
    existingHost instanceof Element &&
    (existingHost as InstanceHostElement).__ASKR_WRAPPER_HOST
  ) {
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
    return existingHost;
  }

  if (
    existingHost instanceof Comment &&
    syncComponentFragmentRange(
      existingHost,
      existingInstance,
      scopedResult,
      forceChildrenUpdate || existingInstance.mounted === false
    )
  ) {
    return existingHost;
  }

  if (
    existingHost instanceof Element &&
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
    existingHost instanceof Comment &&
    syncComponentFragmentRange(
      existingHost,
      existingInstance,
      resolvedResult,
      forceChildrenUpdate || existingInstance.mounted === false
    )
  ) {
    return existingHost;
  }
  if (
    existingHost instanceof Comment &&
    (resolvedResult === null ||
      resolvedResult === undefined ||
      resolvedResult === false)
  ) {
    retainReplacementOwnerChain(
      existingHost,
      existingInstance,
      liveRetainedInstances
    );
    for (const instance of liveRetainedInstances) {
      if (instance.target === null || instance._placeholder === existingHost) {
        instance.target = null;
        instance._placeholder = existingHost;
      }
    }
    return existingHost;
  }
  if (
    existingHost instanceof Element &&
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
      }
      retainReplacementOwnerChain(
        replacement,
        existingInstance,
        liveRetainedInstances
      );
    }
  );

  return nextDom;
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
    setComponentOwnershipIdentity(childInstance, node, getCurrentInstance(), 0);
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
