import { isFragmentType } from '../common/jsx';
import { getRuntimeRenderer, type ComponentInstance } from '../runtime';

// Helper to unwrap Fragment vnodes to get the first intrinsic element child
function unwrapFragmentForFastPath(vnode: unknown): unknown {
  if (!vnode || typeof vnode !== 'object' || !('type' in vnode)) return vnode;
  const v = vnode as {
    type: unknown;
    children?: unknown;
    props?: { children?: unknown };
  };
  // Check if it's a Fragment
  if (isFragmentType(v.type)) {
    const children = v.props?.children ?? v.children;
    if (Array.isArray(children) && children.length > 0) {
      // Return the first child that's an intrinsic element
      for (const child of children) {
        if (child && typeof child === 'object' && 'type' in child) {
          const c = child as { type: unknown };
          if (typeof c.type === 'string') {
            return child;
          }
        }
      }
    }
  }
  return vnode;
}

export function classifyUpdate(instance: ComponentInstance, result: unknown) {
  // Returns a classification describing whether this update is eligible for
  // the reorder-only fast-lane. The classifier mirrors renderer-level
  // heuristics and performs runtime-level checks (mounts, effects, component
  // children) that the renderer cannot reason about.

  // Unwrap Fragment to get the actual element vnode for classification
  const unwrappedResult = unwrapFragmentForFastPath(result);

  if (
    !unwrappedResult ||
    typeof unwrappedResult !== 'object' ||
    !('type' in unwrappedResult)
  )
    return { useFastPath: false, reason: 'not-vnode' };

  const vnode = unwrappedResult as {
    type: unknown;
    children?: unknown;
    props?: { children?: unknown };
  };
  if (vnode == null || typeof vnode.type !== 'string')
    return { useFastPath: false, reason: 'not-intrinsic' };

  const parent = instance.target;
  if (!parent) return { useFastPath: false, reason: 'no-root' };

  const firstChild = parent.children[0] as Element | undefined;
  if (!firstChild) return { useFastPath: false, reason: 'no-first-child' };
  if (firstChild.tagName.toLowerCase() !== String(vnode.type).toLowerCase())
    return { useFastPath: false, reason: 'root-tag-mismatch' };

  const children = vnode.props?.children ?? vnode.children;
  if (!Array.isArray(children))
    return { useFastPath: false, reason: 'no-children-array' };

  // Avoid component child vnodes (they may mount/unmount or trigger async)
  for (const c of children) {
    if (
      typeof c === 'object' &&
      c !== null &&
      'type' in c &&
      typeof (c as { type?: unknown }).type === 'function'
    ) {
      return { useFastPath: false, reason: 'component-child-present' };
    }
  }

  if ((instance.mountOperations?.length ?? 0) > 0)
    return { useFastPath: false, reason: 'pending-mounts' };
  if ((instance.commitOperations?.length ?? 0) > 0)
    return { useFastPath: false, reason: 'pending-lifecycle-commits' };

  // Ask renderer for keyed reorder eligibility (prop differences & heuristics)
  // Ensure a keyed map is available for the first child by populating it proactively.
  const renderer = getRuntimeRenderer();
  try {
    renderer.populateKeyMapForElement(firstChild);
  } catch {
    // ignore
  }

  const oldKeyMap = renderer.getKeyMapForElement(firstChild);
  const decision = renderer.isKeyedReorderFastPathEligible(
    firstChild,
    children,
    oldKeyMap
  );

  if (!decision.useFastPath || decision.totalKeyed < 128)
    return { ...decision, useFastPath: false, reason: 'renderer-declined' };

  return { ...decision, useFastPath: true } as const;
}
