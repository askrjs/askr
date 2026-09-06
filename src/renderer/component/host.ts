import {
  getCurrentCommitTransaction,
  runCommitOperation,
} from '../../runtime/transactions/access';
import {
  getCurrentInstance,
  type ComponentFunction,
  type ComponentInstance,
} from '../../runtime';
import { type ElementWithContext, type InstanceHostNode } from '../dom-host';
import {
  findHostInstanceByType,
  findStableHostInstanceByType,
} from './host-instances';
import { canReconcileComponentHost } from '../hydration/adoption';
import { findRangeEnd, isRangeStart } from '../ownership/ranges';
import { adoptComponentHost } from './host-adoption';
import { updateRetainedComponentHost } from './host-retained';
export { resolveNestedComponentResult } from './host-nested-results';
export {
  findHostInstanceByType,
  inheritComponentCleanupStrict,
  inheritComponentKey,
  isRouteRootComponentVNode,
  nextComponentInstanceId,
} from './host-instances';
export { createComponentElement } from './host-creation';
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
  if (getCurrentCommitTransaction())
    return syncComponentElementInTransaction(
      currentDom,
      node,
      type,
      props,
      parentNamespace,
      forceChildrenUpdate,
      retainedHostInstances,
      hydrationRangeEnd,
      preserveHydrationCursorOnEmpty
    );
  return runCommitOperation(() =>
    syncComponentElementInTransaction(
      currentDom,
      node,
      type,
      props,
      parentNamespace,
      forceChildrenUpdate,
      retainedHostInstances,
      hydrationRangeEnd,
      preserveHydrationCursorOnEmpty
    )
  );
}
function syncComponentElementInTransaction(
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

  if (!existingInstance || existingInstance.fn !== type)
    return adoptComponentHost(
      existingHost,
      node,
      type,
      props,
      parentNamespace,
      forceChildrenUpdate,
      retainedHostInstances,
      hydrationRangeEnd,
      markedHydrationEnd,
      preserveHydrationCursorOnEmpty
    );
  return updateRetainedComponentHost(
    existingHost,
    existingInstance,
    node,
    type,
    props,
    parentNamespace,
    forceChildrenUpdate,
    retainedHostInstances
  );
}
