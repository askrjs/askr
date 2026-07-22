import type { ComponentInstance } from '../runtime';
import { cleanupDetachedComponentHost } from './component-host-cleanup';
import { materializeComponentResultNode } from './component-host-results';
import {
  createDetachedRange,
  getOwnedRange,
  registerRange,
  removeRange,
} from './dom-range';
import type { InstanceHostNode } from './dom-host';
import { getParentNamespace } from './namespaces';

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
