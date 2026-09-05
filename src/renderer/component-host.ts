import {
  getCurrentInstance,
  type ComponentFunction,
  type ComponentInstance,
} from '../runtime';
import { type ElementWithContext, type InstanceHostNode } from './dom-host';
import {
  findHostInstanceByType,
  findStableHostInstanceByType,
} from './component-host-instances';
import { canReconcileComponentHost } from './intrinsic-hydration-adoption';
import { findRangeEnd, isRangeStart } from './dom-range';
import { adoptComponentHost } from './component-host-adoption';
import { updateRetainedComponentHost } from './component-host-retained';
export { resolveNestedComponentResult } from './component-host-nested-results';
export {
  findHostInstanceByType,
  inheritComponentCleanupStrict,
  inheritComponentKey,
  isRouteRootComponentVNode,
  nextComponentInstanceId,
} from './component-host-instances';
export { createComponentElement } from './component-host-creation';
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
