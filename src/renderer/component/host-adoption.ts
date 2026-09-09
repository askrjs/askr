import { renderComponentInScope } from './render-scope';
import { isSSRPortalHydrationAnchor } from '../../common/portal';
import {
  type ContextFrame,
  withContext,
  createComponentInstance,
  getCurrentComponentInstance,
  mountInstanceInline,
  type ComponentFunction,
  type ComponentInstance,
} from '../../runtime';
import { getCurrentContextFrame, getVNodeContextFrame } from '../../runtime';
import { materializeKey } from '../props/attributes';
import { isTransparentComponentRangeResult } from '../children/child-shape';
import {
  adoptHydratedComponentRange,
  adoptMarkedHydratedComponentRange,
} from './fragment-range';
import { pruneComponentHostInstances } from './host-cleanup';
import {
  getRendererDOMHost,
  type ElementWithContext,
  type InstanceHostNode,
} from '../dom-host';
import {
  getVNodeComponentInstance,
  inheritComponentCleanupStrict,
  inheritComponentKey,
  isRouteRootComponentVNode,
  nextComponentInstanceId,
  restoreVNodeComponentInstance,
  setComponentOwnershipIdentity,
  setVNodeComponentInstance,
} from './host-instances';
import { _isDOMElement } from '../types';
import { tagNamesEqualIgnoreCase } from '../utils';
import {
  beginComponentHostReplacement,
  cleanupProvisionalComponentInstance,
  createRetainedHostInstanceSet,
  registerVNodeComponentInstanceRollback,
} from './host-replacement';
import {
  adoptEmptySSRPortalHydrationHost,
  itemInstanceHydrationComplete,
  materializeComponentResultNode,
  materializeEmptyHydrationPlaceholder,
  retainMaterializedReplacementOwnerChain,
} from './host-results';
import { resolveHostNestedComponentResult } from './host-nested-results';

/**
 * The parts of one adoption attempt the two result-handling passes share.
 *
 * `adoptComponentHost` evaluates a component, then evaluates again after
 * resolving nested component results, and offers each result the same two
 * chances to reuse existing DOM. Both chances were written out twice.
 */
interface HostAdoption {
  readonly existingHost: InstanceHostNode;
  readonly node: ElementWithContext;
  readonly props: Record<string, unknown>;
  readonly instance: ComponentInstance;
  readonly retained: Set<ComponentInstance>;
  readonly snapshot: ContextFrame | null;
  readonly hydrationRangeEnd: Node | null | undefined;
  readonly markedHydrationEnd: Comment | null;
  readonly forceChildrenUpdate: boolean;
}

/** Whether the commit should re-apply children rather than trust the markup. */
function shouldForceChildren(adoption: HostAdoption): boolean {
  return (
    adoption.forceChildrenUpdate || adoption.instance.owner.mounted === false
  );
}

/**
 * Claim the server-rendered nodes spanning this component, if `result` is a
 * shape that occupies a range rather than a single element.
 */
function tryAdoptHydratedRange(
  adoption: HostAdoption,
  result: unknown
): Node | null {
  const { existingHost, markedHydrationEnd, hydrationRangeEnd } = adoption;
  if (
    hydrationRangeEnd === undefined ||
    !(
      isTransparentComponentRangeResult(result) ||
      (markedHydrationEnd &&
        (result === null || result === undefined || result === false))
    )
  ) {
    return null;
  }

  return markedHydrationEnd
    ? adoptMarkedHydratedComponentRange(
        existingHost as Comment,
        markedHydrationEnd,
        adoption.instance,
        result,
        shouldForceChildren(adoption),
        adoption.retained
      )
    : adoptHydratedComponentRange(
        existingHost as Element | Comment,
        adoption.instance,
        result,
        hydrationRangeEnd,
        shouldForceChildren(adoption),
        adoption.retained
      );
}

/**
 * Keep the server-rendered element when the component resolved to an intrinsic
 * of the same tag, updating it in place instead of replacing it.
 */
function tryReuseIntrinsicHost(
  adoption: HostAdoption,
  result: unknown
): Node | null {
  const { existingHost, node, props, snapshot } = adoption;
  if (
    !(existingHost instanceof Element) ||
    !_isDOMElement(result) ||
    typeof result.type !== 'string' ||
    !tagNamesEqualIgnoreCase(existingHost.tagName, result.type)
  ) {
    return null;
  }

  withContext(snapshot, () => {
    getRendererDOMHost().updateElementFromVnode(
      existingHost,
      inheritComponentKey(result, node),
      true,
      shouldForceChildren(adoption)
    );
    materializeKey(existingHost, node, props);
  });
  mountInstanceInline(adoption.instance, existingHost);
  itemInstanceHydrationComplete(existingHost);
  return existingHost;
}

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
    getCurrentComponentInstance(),
    0
  );
  hydrationInstance.isRoot = isRouteRootComponentVNode(node);
  hydrationInstance.portalScope =
    getCurrentComponentInstance()?.portalScope ?? hydrationInstance.portalScope;
  inheritComponentCleanupStrict(hydrationInstance);

  const previousVNodeInstance = getVNodeComponentInstance(node);
  const liveRetainedInstances = createRetainedHostInstanceSet(
    hydrationInstance,
    retainedHostInstances
  );
  const adoption: HostAdoption = {
    existingHost,
    node,
    props,
    instance: hydrationInstance,
    retained: liveRetainedInstances,
    snapshot,
    hydrationRangeEnd,
    markedHydrationEnd,
    forceChildrenUpdate,
  };
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

    const scopedResult = renderComponentInScope(hydrationInstance, snapshot);

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

    const adoptedRange = tryAdoptHydratedRange(adoption, scopedResult);
    if (adoptedRange) {
      return adoptedRange;
    }

    const reusedHost = tryReuseIntrinsicHost(adoption, scopedResult);
    if (reusedHost) {
      return reusedHost;
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
    const adoptedResolvedRange = tryAdoptHydratedRange(
      adoption,
      resolvedResult.result
    );
    if (adoptedResolvedRange) {
      return adoptedResolvedRange;
    }

    const reusedResolvedHost = tryReuseIntrinsicHost(
      adoption,
      resolvedResult.result
    );
    if (reusedResolvedHost) {
      return reusedResolvedHost;
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
