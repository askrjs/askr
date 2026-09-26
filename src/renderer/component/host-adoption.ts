import { renderComponentInScope } from './render-scope';
import {
  isNamedPortalHost,
  isSSRPortalHydrationAnchor,
} from '../../common/portal';
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
import { writeHostOwners } from '../ownership/nodes';
import {
  isScalarChild,
  isTransparentComponentRangeResult,
} from '../children/child-shape';
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
  commitAsComponent,
  itemInstanceHydrationComplete,
  materializeComponentResultNode,
  materializeEmptyHydrationPlaceholder,
  retainMaterializedReplacementOwnerChain,
} from './host-results';
import { resolveHostNestedComponentResult } from './host-nested-results';
import { isHydrationAdoptionScopeActive } from '../hydration/adoption';
import { registerCommitRollback } from '../../runtime/transactions/access';
import { getDefaultPortalHost } from '../../common/default-portal-runtime';

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

/**
 * Commit an adopted result as the component that rendered it.
 *
 * Server nodes have no owners yet, so while hydrating, the children in the
 * result are this component's, exactly as when the result is created fresh.
 * Committing them under the caller's scope recorded the caller as their
 * parent, and the component's first update then failed to find its keyed
 * children and remounted them. Outside hydration, adoption takes over a host
 * another component rendered, and that path keeps committing under the
 * caller's scope.
 */
function commitAdoptedResult<T>(owner: ComponentInstance, commit: () => T): T {
  return isHydrationAdoptionScopeActive()
    ? commitAsComponent(owner, commit)
    : commit();
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
  result: unknown,
  owner: ComponentInstance
): Node | null {
  const { existingHost, markedHydrationEnd, hydrationRangeEnd } = adoption;
  if (
    hydrationRangeEnd === undefined ||
    !(
      isTransparentComponentRangeResult(result) ||
      (existingHost instanceof Text && isScalarChild(result)) ||
      (markedHydrationEnd &&
        (isScalarChild(result) ||
          result === null ||
          result === undefined ||
          result === false))
    )
  ) {
    return null;
  }

  return commitAdoptedResult(owner, () =>
    markedHydrationEnd
      ? adoptMarkedHydratedComponentRange(
          existingHost as Comment,
          markedHydrationEnd,
          adoption.instance,
          result,
          shouldForceChildren(adoption),
          adoption.retained,
          adoption.instance.fn === getDefaultPortalHost() &&
            (result === null || result === undefined || result === false)
        )
      : adoptHydratedComponentRange(
          existingHost,
          adoption.instance,
          result,
          hydrationRangeEnd,
          shouldForceChildren(adoption),
          adoption.retained
        )
  );
}

/**
 * Keep the server-rendered element when the component resolved to an intrinsic
 * of the same tag, updating it in place instead of replacing it.
 */
function tryReuseIntrinsicHost(
  adoption: HostAdoption,
  result: unknown,
  owner: ComponentInstance
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

  withContext(snapshot, () =>
    commitAdoptedResult(owner, () => {
      getRendererDOMHost().updateElementFromVnode(
        existingHost,
        inheritComponentKey(result, node),
        true,
        shouldForceChildren(adoption)
      );
      materializeKey(existingHost, node, props);
    })
  );
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
    !markedHydrationEnd &&
    !(
      existingHost instanceof Text &&
      hydrationRangeEnd !== undefined &&
      isHydrationAdoptionScopeActive()
    )
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

    if (
      isHydrationAdoptionScopeActive() &&
      isNamedPortalHost(type) &&
      existingHost instanceof Element &&
      (scopedResult === null ||
        scopedResult === undefined ||
        scopedResult === false)
    ) {
      // A host can render before its writer during hydration. Keep its server
      // element for the slot update later in this mount to adopt in place.
      const portalHost = existingHost as InstanceHostNode & Element;
      const previousInstances = portalHost.__ASKR_INSTANCES?.slice();
      const previousInstance = portalHost.__ASKR_INSTANCE;
      registerCommitRollback(() =>
        writeHostOwners(
          portalHost,
          previousInstances,
          previousInstance,
          previousInstances !== undefined,
          previousInstance !== undefined
        )
      );
      mountInstanceInline(hydrationInstance, portalHost);
      return portalHost;
    }

    if (
      type === getDefaultPortalHost() &&
      markedHydrationEnd &&
      (scopedResult === null ||
        scopedResult === undefined ||
        scopedResult === false)
    ) {
      const portalRange = tryAdoptHydratedRange(
        adoption,
        scopedResult,
        hydrationInstance
      );
      if (portalRange) return portalRange;
    }

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

    const adoptedRange = tryAdoptHydratedRange(
      adoption,
      scopedResult,
      hydrationInstance
    );
    if (adoptedRange) {
      return adoptedRange;
    }

    const reusedHost = tryReuseIntrinsicHost(
      adoption,
      scopedResult,
      hydrationInstance
    );
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
      resolvedResult.result,
      resolvedResult.owner
    );
    if (adoptedResolvedRange) {
      return adoptedResolvedRange;
    }

    const reusedResolvedHost = tryReuseIntrinsicHost(
      adoption,
      resolvedResult.result,
      resolvedResult.owner
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
