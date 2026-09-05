import { isPromiseLike } from '../common/promise';
import { isSSRPortalHydrationAnchor } from '../common/portal';
import {
  captureInlineRenderSnapshot,
  createComponentInstance,
  enterDomCommitScope,
  getCurrentInstance,
  mountInstanceInline,
  renderComponentInline,
  restoreDomCommitScope,
  type ComponentFunction,
  type ComponentInstance,
} from '../runtime';
import {
  getCurrentContextFrame,
  getVNodeContextFrame,
  markVNodeTreeWithContextFrame,
  withContext,
} from '../runtime';
import { materializeKey } from './attributes';
import {
  isTransparentComponentRangeResult,
  normalizeComponentChildren,
} from './child-shape';
import {
  adoptHydratedComponentRange,
  adoptMarkedHydratedComponentRange,
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
import { _isDOMElement, type DOMElement, type VNode } from './types';
import { canReconcileComponentHost } from './intrinsic-hydration-adoption';
import { tagNamesEqualIgnoreCase } from './utils';
import {
  beginComponentHostReplacement,
  cleanupProvisionalComponentInstance,
  createRetainedHostInstanceSet,
  registerVNodeComponentInstanceRollback,
} from './component-host-replacement';
import { findRangeEnd, isRangeStart } from './dom-range';
import {
  adoptEmptySSRPortalHydrationHost,
  itemInstanceHydrationComplete,
  materializeComponentResultNode,
  materializeEmptyHydrationPlaceholder,
  retainMaterializedReplacementOwnerChain,
  retainReplacementOwnerChain,
} from './component-host-results';
import {
  resolveHostNestedComponentResult,
  resolveWrapperHostResult,
} from './component-host-nested-results';
export { resolveNestedComponentResult } from './component-host-nested-results';
export {
  findHostInstanceByType,
  inheritComponentCleanupStrict,
  inheritComponentKey,
  isRouteRootComponentVNode,
  nextComponentInstanceId,
} from './component-host-instances';
export { createComponentElement } from './component-host-creation';

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

  const markedHydrationEnd =
    existingHost instanceof Comment &&
    hydrationRangeEnd instanceof Comment &&
    isRangeStart(existingHost) &&
    findRangeEnd(existingHost) === hydrationRangeEnd
      ? hydrationRangeEnd
      : null;

  if (!canReconcileComponentHost(existingHost, Boolean(existingInstance)))
    return null;

  const domHost = getRendererDOMHost();

  if (!existingInstance || existingInstance.fn !== type) {
    if (
      !(existingHost instanceof Element) &&
      !isSSRPortalHydrationAnchor(existingHost) &&
      !markedHydrationEnd
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
        (isTransparentComponentRangeResult(scopedResult) ||
          (markedHydrationEnd &&
            (scopedResult === null ||
              scopedResult === undefined ||
              scopedResult === false)))
      ) {
        const adoptedHost = markedHydrationEnd
          ? adoptMarkedHydratedComponentRange(
              existingHost as Comment,
              markedHydrationEnd,
              hydrationInstance,
              scopedResult,
              forceChildrenUpdate ||
                hydrationInstance.ownership.mounted === false,
              liveRetainedInstances
            )
          : adoptHydratedComponentRange(
              existingHost as Element | Comment,
              hydrationInstance,
              scopedResult,
              hydrationRangeEnd,
              forceChildrenUpdate ||
                hydrationInstance.ownership.mounted === false,
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
            forceChildrenUpdate || hydrationInstance.ownership.mounted === false
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
          resolvedResult.result
        )
      ) {
        return existingHost;
      }
      if (
        hydrationRangeEnd !== undefined &&
        (isTransparentComponentRangeResult(resolvedResult.result) ||
          (markedHydrationEnd &&
            (resolvedResult.result === null ||
              resolvedResult.result === undefined ||
              resolvedResult.result === false)))
      ) {
        const adoptedHost = markedHydrationEnd
          ? adoptMarkedHydratedComponentRange(
              existingHost as Comment,
              markedHydrationEnd,
              hydrationInstance,
              resolvedResult.result,
              forceChildrenUpdate ||
                hydrationInstance.ownership.mounted === false,
              liveRetainedInstances
            )
          : adoptHydratedComponentRange(
              existingHost as Element | Comment,
              hydrationInstance,
              resolvedResult.result,
              hydrationRangeEnd,
              forceChildrenUpdate ||
                hydrationInstance.ownership.mounted === false,
              liveRetainedInstances
            );
        if (adoptedHost) {
          return adoptedHost;
        }
      }
      if (
        existingHost instanceof Element &&
        _isDOMElement(resolvedResult.result) &&
        typeof resolvedResult.result.type === 'string' &&
        tagNamesEqualIgnoreCase(
          existingHost.tagName,
          resolvedResult.result.type
        )
      ) {
        withContext(snapshot, () => {
          domHost.updateElementFromVnode(
            existingHost,
            inheritComponentKey(resolvedResult.result as DOMElement, node),
            true,
            forceChildrenUpdate || hydrationInstance.ownership.mounted === false
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
          retainMaterializedReplacementOwnerChain(
            replacement,
            hydrationInstance,
            liveRetainedInstances
          );
        }
      );

      return nextDom;
    } catch (error) {
      restoreVNodeComponentInstance(node, previousVNodeInstance);
      if (!hydrationInstance.ownership.mounted) {
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
      existingInstance,
      scopedResult,
      snapshot ?? null,
      liveRetainedInstances
    );
    const previousInstance = enterDomCommitScope(wrapperResult.owner);
    try {
      domHost.updateElementChildren(
        existingHost,
        normalizeComponentChildren(wrapperResult.result) as VNode[]
      );
    } finally {
      restoreDomCommitScope(previousInstance);
    }
    pruneComponentHostInstances(existingHost, liveRetainedInstances);
    return existingHost;
  }

  if (
    existingHost instanceof Comment &&
    syncComponentFragmentRange(
      existingHost,
      existingInstance,
      scopedResult,
      forceChildrenUpdate || existingInstance.ownership.mounted === false
    )
  ) {
    retainReplacementOwnerChain(
      existingHost,
      existingInstance,
      liveRetainedInstances
    );
    pruneComponentHostInstances(existingHost, liveRetainedInstances);
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
        forceChildrenUpdate || existingInstance.ownership.mounted === false
      );
      materializeKey(existingHost, node, props);
    });
    pruneComponentHostInstances(existingHost, liveRetainedInstances);
    return existingHost;
  }

  const resolvedResult = resolveHostNestedComponentResult(
    existingHost,
    existingInstance,
    scopedResult,
    snapshot ?? null,
    liveRetainedInstances
  );
  let didSyncResolvedRange = false;
  if (existingHost instanceof Comment) {
    const previousInstance = enterDomCommitScope(resolvedResult.owner);
    try {
      didSyncResolvedRange = syncComponentFragmentRange(
        existingHost,
        existingInstance,
        resolvedResult.result,
        forceChildrenUpdate || existingInstance.ownership.mounted === false
      );
    } finally {
      restoreDomCommitScope(previousInstance);
    }
  }
  if (didSyncResolvedRange) {
    retainReplacementOwnerChain(
      existingHost,
      existingInstance,
      liveRetainedInstances
    );
    pruneComponentHostInstances(existingHost, liveRetainedInstances);
    return existingHost;
  }
  if (
    existingHost instanceof Comment &&
    (resolvedResult.result === null ||
      resolvedResult.result === undefined ||
      resolvedResult.result === false)
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
    pruneComponentHostInstances(existingHost, liveRetainedInstances);
    return existingHost;
  }
  if (
    existingHost instanceof Element &&
    _isDOMElement(resolvedResult.result) &&
    typeof resolvedResult.result.type === 'string' &&
    tagNamesEqualIgnoreCase(existingHost.tagName, resolvedResult.result.type)
  ) {
    withContext(snapshot, () => {
      domHost.updateElementFromVnode(
        existingHost,
        inheritComponentKey(resolvedResult.result as DOMElement, node),
        true,
        forceChildrenUpdate || existingInstance.ownership.mounted === false
      );
      materializeKey(existingHost, node, props);
    });
    pruneComponentHostInstances(existingHost, liveRetainedInstances);
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
      retainMaterializedReplacementOwnerChain(
        replacement,
        existingInstance,
        liveRetainedInstances
      );
    }
  );

  return nextDom;
}
