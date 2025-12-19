import { globalScheduler } from './scheduler';
import { logger } from '../dev/logger';
import {
  getKeyMapForElement,
  isKeyedReorderFastPathEligible,
} from '../renderer/dom';
import type { ComponentInstance } from './component';

let _bulkCommitActive = false;

export function enterBulkCommit(): void {
  _bulkCommitActive = true;
}

export function exitBulkCommit(): void {
  _bulkCommitActive = false;
}

export function isBulkCommitActive(): boolean {
  return _bulkCommitActive;
}

/**
 * Attempt to execute a runtime fast-lane for a single component's synchronous
 * render result. Returns true if the fast-lane was used and commit was done.
 *
 * Preconditions (checked conservatively):
 * - The render result is an intrinsic element root with keyed children
 * - The renderer's fast-path heuristics indicate to use the fast-path
 * - No mount operations are pending on the component instance
 * - No child vnodes are component functions (avoid async/component mounts)
 */
export function classifyUpdate(instance: ComponentInstance, result: unknown) {
  // Returns a classification describing whether this update is eligible for
  // the reorder-only fast-lane. The classifier mirrors renderer-level
  // heuristics and performs runtime-level checks (mounts, effects, component
  // children) that the renderer cannot reason about.
  if (!result || typeof result !== 'object' || !('type' in result))
    return { useFastPath: false, reason: 'not-vnode' };
  const vnode = result as {
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

  const children =
    (vnode as { children?: unknown; props?: { children?: unknown } })
      .children ||
    (vnode as { props?: { children?: unknown } }).props?.children;
  if (!Array.isArray(children))
    return { useFastPath: false, reason: 'no-children-array' };

  // Avoid component child vnodes (they may mount/unmount or trigger async)
  for (let i = 0; i < children.length; i++) {
    const c = children[i];
    if (
      typeof c === 'object' &&
      c !== null &&
      'type' in c &&
      typeof (c as { type?: unknown }).type === 'function'
    ) {
      return { useFastPath: false, reason: 'component-child-present' };
    }
  }

  if (instance.mountOperations.length > 0)
    return { useFastPath: false, reason: 'pending-mounts' };

  // Ask renderer for keyed reorder eligibility (prop differences & heuristics)
  const oldKeyMap = getKeyMapForElement(firstChild);
  const decision = isKeyedReorderFastPathEligible(
    firstChild,
    children,
    oldKeyMap
  );

  if (!decision.useFastPath || decision.totalKeyed < 128)
    return { ...decision, useFastPath: false, reason: 'renderer-declined' };

  return { ...decision, useFastPath: true } as const;
}

export function commitReorderOnly(
  instance: ComponentInstance,
  result: unknown
) {
  // Performs the minimal, synchronous reorder-only commit. Sets dev-only
  // diagnostic fields on globalThis for test assertions and verifies
  // invariants (no mounts, no effects, single DOM commit).
  const evaluate = (
    globalThis as unknown as {
      __ASKR_RENDERER?: {
        evaluate?: (node: unknown, target: Element | null) => void;
      };
    }
  ).__ASKR_RENDERER?.evaluate;
  if (typeof evaluate !== 'function') {
    logger.warn(
      '[Tempo][FASTPATH][DEV] renderer.evaluate not available; declining fast-lane'
    );
    return false;
  }

  const schedBefore =
    process.env.NODE_ENV !== 'production' ? globalScheduler.getState() : null;

  enterBulkCommit();

  try {
    // Execute the renderer synchronously. This performs a single atomic
    // replaceChildren commit and updates keyed maps. We avoid any runtime
    // bookkeeping while bulk commit is active.
    evaluate(result, instance.target);

    // Dev-only invariant checks and diagnostics
    if (process.env.NODE_ENV !== 'production') {
      // Commit count recorded by renderer (set by fast-path code)
      const _g = globalThis as unknown as Record<string, unknown>;
      const commitCount =
        (_g.__ASKR_LAST_FASTPATH_COMMIT_COUNT as number | undefined) ?? 0;
      const invariants = {
        commitCount,
        mountOps: instance.mountOperations.length,
        cleanupFns: instance.cleanupFns.length,
      } as const;
      _g.__ASKR_LAST_FASTLANE_INVARIANTS = invariants;

      if (commitCount !== 1) {
        throw new Error(
          'Fast-lane invariant violated: expected exactly one DOM commit during reorder-only commit'
        );
      }
      if (invariants.mountOps > 0) {
        throw new Error(
          'Fast-lane invariant violated: mount operations were registered during bulk commit'
        );
      }
      if (invariants.cleanupFns > 0) {
        throw new Error(
          'Fast-lane invariant violated: cleanup functions were added during bulk commit'
        );
      }

      const schedAfter = globalScheduler.getState();
      if (
        schedBefore &&
        schedAfter &&
        schedBefore.taskCount !== schedAfter.taskCount
      ) {
        throw new Error(
          'Fast-lane invariant violated: scheduler tasks were enqueued during bulk commit'
        );
      }
    }

    return true;
  } finally {
    exitBulkCommit();
  }
}

export function tryRuntimeFastLaneSync(
  instance: ComponentInstance,
  result: unknown
): boolean {
  const cls = classifyUpdate(instance, result);
  if (!cls.useFastPath) return false;

  try {
    return commitReorderOnly(instance, result);
  } catch (err) {
    // Surface dev-only invariant failures, otherwise decline silently
    if (process.env.NODE_ENV !== 'production') throw err;
    return false;
  }
}

// Expose fastlane bridge on globalThis for environments/tests that access it
// synchronously without using ES module dynamic imports.
if (typeof globalThis !== 'undefined') {
  const _g = globalThis as unknown as Record<string, unknown>;
  _g.__ASKR_FASTLANE = {
    isBulkCommitActive,
    enterBulkCommit,
    exitBulkCommit,
    tryRuntimeFastLaneSync,
  };
}
