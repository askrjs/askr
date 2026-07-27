import { getVNodeContextFrame, type ComponentInstance } from '../runtime';
import { hasTransparentComponentResult } from '../common/control';
import { cleanupDetachedComponentHost } from './component-host-cleanup';
import { syncComponentFragmentRange } from './component-fragment-range';
import {
  materializeComponentResultNode,
  resolveHostNestedComponentResult,
} from './component-host-results';
import { createRetainedHostInstanceSet } from './component-host-replacement';
import {
  createDetachedRange,
  getOwnedRange,
  registerRange,
  removeRange,
} from './dom-range';
import type { InstanceHostNode } from './dom-host';
import { getParentNamespace } from './namespaces';
import { _isDOMElement } from './types';

export function replaceComponentRange(
  instance: ComponentInstance,
  result: unknown,
  placeholder: Comment
): Node | null {
  const previousRange = getOwnedRange(instance);
  const parent = placeholder.parentNode;
  if (
    !previousRange ||
    previousRange.single ||
    previousRange.start !== placeholder ||
    !(parent instanceof Element)
  ) {
    return null;
  }

  if (syncComponentFragmentRange(placeholder, instance, result, false)) {
    return placeholder;
  }

  if (_isDOMElement(result) && hasTransparentComponentResult(result.type)) {
    const retainedInstances = createRetainedHostInstanceSet(instance);
    const resolvedResult = resolveHostNestedComponentResult(
      placeholder,
      instance,
      result,
      getVNodeContextFrame(result) ?? instance.ownerFrame ?? null,
      retainedInstances
    );
    if (
      syncComponentFragmentRange(placeholder, instance, resolvedResult, false)
    ) {
      return placeholder;
    }
  }

  const materialized = materializeComponentResultNode(
    instance,
    result,
    getParentNamespace(parent)
  );
  const next = createDetachedRange(materialized, instance);
  const nextHost = next.range.start as InstanceHostNode;
  nextHost.__ASKR_INSTANCE = instance;
  nextHost.__ASKR_INSTANCES = [instance];

  parent.insertBefore(next.fragment ?? next.range.start, previousRange.start);
  removeRange(previousRange, (node) => {
    cleanupDetachedComponentHost(node as InstanceHostNode, [instance]);
    node.parentNode?.removeChild(node);
  });
  registerRange(next.range, instance);
  return nextHost;
}
