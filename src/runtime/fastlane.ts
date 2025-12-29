import { globalScheduler } from './scheduler';
import { logger } from '../dev/logger';
import type { ComponentInstance } from './component';
import {
  getKeyMapForElement,
  isKeyedReorderFastPathEligible,
  populateKeyMapForElement,
} from '../renderer/keyed';
import { Fragment } from '../common/jsx';
import { setDevValue, getDevValue } from './dev-namespace';

let _bulkCommitActive = false;
let _appliedParents: WeakSet<Element> | null = null;

export function enterBulkCommit(): void {
  _bulkCommitActive = true;
  // Initialize registry of parents that had fast-path applied during this bulk commit
  _appliedParents = new WeakSet<Element>();

  // Clear any previously scheduled synchronous scheduler tasks so they don't
  // retrigger evaluations during the committed fast-path.
  try {
    const cleared = globalScheduler.clearPendingSyncTasks?.() ?? 0;
    setDevValue('__ASKR_FASTLANE_CLEARED_TASKS', cleared);
  } catch (err) {
    if (process.env.NODE_ENV !== 'production') throw err;
  }
}

export function exitBulkCommit(): void {
  _bulkCommitActive = false;
  // Clear registry to avoid leaking across commits
  _appliedParents = null;
}

export function isBulkCommitActive(): boolean {
  return _bulkCommitActive;
}

// Mark that a fast-path was applied on a parent element during the active
// bulk commit. No-op if there is no active bulk commit.
export function markFastPathApplied(parent: Element): void {
  if (!_appliedParents) return;
  try {
    _appliedParents.add(parent);
  } catch (e) {
    void e;
  }
}

export function isFastPathApplied(parent: Element): boolean {
  return !!(_appliedParents && _appliedParents.has(parent));
}

function finalizeReadSubscriptions(instance: ComponentInstance): void {
  const newSet = instance._pendingReadStates ?? new Set();
  const oldSet = instance._lastReadStates ?? new Set();
  const token = instance._currentRenderToken;

  if (token === undefined) return;

  // Remove subscriptions for states that were read previously but not in this render
  for (const s of oldSet) {
    if (!newSet.has(s)) {
      const readers = (s as { _readers?: Map<ComponentInstance, number> })
        ._readers;
      if (readers) readers.delete(instance);
    }
  }

  // Commit token becomes the authoritative token for this instance's last render
  instance.lastRenderToken = token;

  // Record subscriptions for states read during this render
  for (const s of newSet) {
    let readers = (s as { _readers?: Map<ComponentInstance, number> })._readers;
    if (!readers) {
      readers = new Map();
      (s as { _readers?: Map<ComponentInstance, number> })._readers = readers;
    }
    readers.set(instance, instance.lastRenderToken ?? 0);
  }

  instance._lastReadStates = newSet;
  instance._pendingReadStates = new Set();
  instance._currentRenderToken = undefined;
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

// Helper to unwrap Fragment vnodes to get the first intrinsic element child
function unwrapFragmentForFastPath(vnode: unknown): unknown {
  if (!vnode || typeof vnode !== 'object' || !('type' in vnode)) return vnode;
  const v = vnode as {
    type: unknown;
    children?: unknown;
    props?: { children?: unknown };
  };
  // Check if it's a Fragment
  if (
    typeof v.type === 'symbol' &&
    (v.type === Fragment || String(v.type) === 'Symbol(askr.fragment)')
  ) {
    const children = v.children || v.props?.children;
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

  const children = vnode.children || vnode.props?.children;
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

  if (instance.mountOperations.length > 0)
    return { useFastPath: false, reason: 'pending-mounts' };

  // Ask renderer for keyed reorder eligibility (prop differences & heuristics)
  // Ensure a keyed map is available for the first child by populating it proactively.
  try {
    populateKeyMapForElement(firstChild);
  } catch {
    // ignore
  }

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
): boolean {
  // Performs the minimal, synchronous reorder-only commit.
  const evaluate = (
    globalThis as {
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
    globalScheduler.runWithSyncProgress(() => {
      evaluate(result, instance.target);

      // Finalize runtime bookkeeping (read subscriptions / tokens)
      try {
        finalizeReadSubscriptions(instance);
      } catch (e) {
        if (process.env.NODE_ENV !== 'production') throw e;
      }
    });

    // Clear any synchronous tasks scheduled during the commit
    const clearedAfter = globalScheduler.clearPendingSyncTasks?.() ?? 0;
    setDevValue('__FASTLANE_CLEARED_AFTER', clearedAfter);

    // Dev-only invariant checks
    if (process.env.NODE_ENV !== 'production') {
      validateFastLaneInvariants(instance, schedBefore);
    }

    return true;
  } finally {
    exitBulkCommit();
  }
  // Dev-only: verify bulk commit flag was properly cleared (after finally to avoid no-unsafe-finally)
  if (process.env.NODE_ENV !== 'production') {
    if (isBulkCommitActive()) {
      throw new Error(
        'Fast-lane invariant violated: bulk commit flag still set after commit'
      );
    }
  }
}

/**
 * Validates fast-lane invariants in dev mode.
 * Extracted to reduce complexity in commitReorderOnly.
 */
function validateFastLaneInvariants(
  instance: ComponentInstance,
  schedBefore: ReturnType<typeof globalScheduler.getState> | null
): void {
  const commitCount = getDevValue<number>('__LAST_FASTPATH_COMMIT_COUNT') ?? 0;
  const invariants = {
    commitCount,
    mountOps: instance.mountOperations.length,
    cleanupFns: instance.cleanupFns.length,
  };
  setDevValue('__LAST_FASTLANE_INVARIANTS', invariants);

  if (commitCount !== 1) {
    console.error(
      '[FASTLANE][INV] commitCount',
      commitCount,
      'diag',
      (globalThis as Record<string, unknown>).__ASKR_DIAG
    );
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
    schedAfter.taskCount > schedBefore.taskCount
  ) {
    console.error(
      '[FASTLANE] schedBefore, schedAfter',
      schedBefore,
      schedAfter
    );
    console.error('[FASTLANE] enqueue logs', getDevValue('__ENQUEUE_LOGS'));
    throw new Error(
      'Fast-lane invariant violated: scheduler enqueued leftover work during bulk commit'
    );
  }

  // Final quiescence assertion
  let finalState = globalScheduler.getState();
  const executing = globalScheduler.isExecuting();
  let outstandingAfter = Math.max(
    0,
    finalState.taskCount - (executing ? 1 : 0)
  );

  if (outstandingAfter !== 0) {
    // Attempt to clear newly enqueued synchronous tasks
    let attempts = 0;
    while (attempts < 5) {
      const cleared = globalScheduler.clearPendingSyncTasks?.() ?? 0;
      if (cleared === 0) break;
      attempts++;
    }
    finalState = globalScheduler.getState();
    outstandingAfter = Math.max(
      0,
      finalState.taskCount - (globalScheduler.isExecuting() ? 1 : 0)
    );
    if (outstandingAfter !== 0) {
      console.error(
        '[FASTLANE] Post-commit enqueue logs:',
        getDevValue('__ENQUEUE_LOGS')
      );
      console.error(
        '[FASTLANE] Cleared counts:',
        getDevValue('__FASTLANE_CLEARED_TASKS'),
        getDevValue('__FASTLANE_CLEARED_AFTER')
      );
      throw new Error(
        `Fast-lane invariant violated: scheduler has ${finalState.taskCount} pending task(s) after commit`
      );
    }
  }
}

export function tryRuntimeFastLaneSync(
  instance: ComponentInstance,
  result: unknown
): boolean {
  const cls = classifyUpdate(instance, result);
  if (!cls.useFastPath) {
    // Clear stale fast-path diagnostics
    setDevValue('__LAST_FASTPATH_STATS', undefined);
    setDevValue('__LAST_FASTPATH_COMMIT_COUNT', 0);
    return false;
  }

  try {
    return commitReorderOnly(instance, result);
  } catch (err) {
    // Surface dev-only invariant failures, otherwise decline silently
    if (process.env.NODE_ENV !== 'production') throw err;
    return false;
  }
}

// Expose fastlane bridge on globalThis for environments/tests
if (typeof globalThis !== 'undefined') {
  (globalThis as Record<string, unknown>).__ASKR_FASTLANE = {
    isBulkCommitActive,
    enterBulkCommit,
    exitBulkCommit,
    tryRuntimeFastLaneSync,
    markFastPathApplied,
    isFastPathApplied,
  };
}
