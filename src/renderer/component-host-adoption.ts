import { isPromiseLike } from '../common/promise';
import { isSSRPortalHydrationAnchor } from '../common/portal';
import {
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
import { materializeKey } from './attributes';
import { isTransparentComponentRangeResult } from './child-shape';
import {
  adoptHydratedComponentRange,
  adoptMarkedHydratedComponentRange,
} from './component-fragment-range';
import { pruneComponentHostInstances } from './component-host-cleanup';
import {
  getRendererDOMHost,
  type ElementWithContext,
  type InstanceHostNode,
} from './dom-host';
import {
  getVNodeComponentInstance,
  inheritComponentCleanupStrict,
  inheritComponentKey,
  isRouteRootComponentVNode,
  nextComponentInstanceId,
  restoreVNodeComponentInstance,
  setComponentOwnershipIdentity,
  setVNodeComponentInstance,
} from './component-host-instances';
import { _isDOMElement, type DOMElement } from './types';
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
  retainMaterializedReplacementOwnerChain,
} from './component-host-results';
import { resolveHostNestedComponentResult } from './component-host-nested-results';
export function adoptComponentHost(
  existingHost: InstanceHostNode,
  node: ElementWithContext,
  type: ComponentFunction,
  props: Record<string, unknown>,
  parentNamespace: string | undefined,
  forceChildrenUpdate: boolean,
  retainedHostInstances: Iterable<ComponentInstance> | undefined,
  hydrationRangeEnd: Node | null | undefined,
  markedHydrationEnd: Comment | null,
  preserveHydrationCursorOnEmpty: boolean
): Node | null {
  const domHost = getRendererDOMHost();

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
            forceChildrenUpdate || hydrationInstance.owner.mounted === false,
            liveRetainedInstances
          )
        : adoptHydratedComponentRange(
            existingHost as Element | Comment,
            hydrationInstance,
            scopedResult,
            hydrationRangeEnd,
            forceChildrenUpdate || hydrationInstance.owner.mounted === false,
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
          forceChildrenUpdate || hydrationInstance.owner.mounted === false
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
            forceChildrenUpdate || hydrationInstance.owner.mounted === false,
            liveRetainedInstances
          )
        : adoptHydratedComponentRange(
            existingHost as Element | Comment,
            hydrationInstance,
            resolvedResult.result,
            hydrationRangeEnd,
            forceChildrenUpdate || hydrationInstance.owner.mounted === false,
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
      tagNamesEqualIgnoreCase(existingHost.tagName, resolvedResult.result.type)
    ) {
      withContext(snapshot, () => {
        domHost.updateElementFromVnode(
          existingHost,
          inheritComponentKey(resolvedResult.result as DOMElement, node),
          true,
          forceChildrenUpdate || hydrationInstance.owner.mounted === false
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
    if (!hydrationInstance.owner.mounted) {
      cleanupProvisionalComponentInstance(hydrationInstance);
    }
    throw error;
  }
}
