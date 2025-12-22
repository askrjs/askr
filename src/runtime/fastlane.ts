import { globalScheduler } from './scheduler';
import { logger } from '../dev/logger';
import {
  getKeyMapForElement,
  isKeyedReorderFastPathEligible,
} from '../renderer';
import type { ComponentInstance } from './component';

let _bulkCommitActive = false;
let _appliedParents: WeakSet<Element> | null = null;

export function enterBulkCommit(): void {
  _bulkCommitActive = true;
  // Initialize registry of parents that had fast-path applied during this bulk commit
  _appliedParents = new WeakSet<Element>();

  // Clear any previously scheduled synchronous scheduler tasks so they don't
  // retrigger evaluations during the committed fast-path. This is a safety
  // barrier to enforce quiescence for bulk commits.
  try {
    const cleared = globalScheduler.clearPendingSyncTasks?.() ?? 0;
    if (process.env.NODE_ENV !== 'production') {
      const _g = globalThis as Record<string, unknown>;
      _g.__ASKR_FASTLANE_CLEARED_TASKS = cleared;
    }
  } catch (err) {
    // In the unlikely event clearing fails in production, ignore it; in dev rethrow
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
  // Ensure a keyed map is available for the first child by populating it
  // proactively if necessary. This reduces race conditions where the DOM
  // might be cleared during evaluation and the renderer cannot discover
  // existing keyed elements.
  try {
    // Import function dynamically to avoid circular load issues
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- circular import; require used intentionally to perform a synchronous call
    const dom = require('../renderer') as typeof import('../renderer');
    if (typeof dom.populateKeyMapForElement === 'function') {
      try {
        dom.populateKeyMapForElement(firstChild);
      } catch (e) {
        void e;
      }
    }
  } catch (e) {
    void e;
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
) {
  // Performs the minimal, synchronous reorder-only commit. Sets dev-only
  // diagnostic fields on globalThis for test assertions and verifies
  // invariants (no mounts, no effects, single DOM commit).
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
    // Execute the renderer synchronously inside a controlled scheduler
    // escape hatch that allows deterministic synchronous scheduler progress
    // while still preserving bulk-commit semantics (no async tasks, single DOM
    // mutation, and rollback safety).
    globalScheduler.runWithSyncProgress(() => {
      evaluate(result, instance.target);

      // Ensure runtime bookkeeping (read subscriptions / tokens) is finalized
      // even when we bypass the normal scheduler-driven commit path.
      try {
        // Import function dynamically to avoid circular import at module top-level
        // (component module defines finalizeReadSubscriptions).
        // eslint-disable-next-line @typescript-eslint/no-require-imports -- circular import; require used intentionally to perform a synchronous call
        const comp = require('./component') as typeof import('./component');
        if (typeof comp?.finalizeReadSubscriptions === 'function') {
          try {
            comp.finalizeReadSubscriptions(instance);
          } catch (e) {
            // Surface in dev, ignore in prod
            if (process.env.NODE_ENV !== 'production') throw e;
          }
        }
      } catch (e) {
        void e;
      }
    });

    // Safety: clear any synchronous tasks that were scheduled during the commit
    // but did not get executed due to flush reentrancy or microtask timing. This
    // ensures final quiescence for bulk commits.
    try {
      const clearedAfter = globalScheduler.clearPendingSyncTasks?.() ?? 0;
      if (process.env.NODE_ENV !== 'production') {
        const _g = globalThis as Record<string, unknown>;
        _g.__ASKR_FASTLANE_CLEARED_AFTER = clearedAfter;
      }
    } catch (err) {
      if (process.env.NODE_ENV !== 'production') throw err;
    }

    // Dev-only invariant checks and diagnostics
    if (process.env.NODE_ENV !== 'production') {
      // Commit count recorded by renderer (set by fast-path code)
      const _g = globalThis as Record<string, unknown>;
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
        // Only fail if outstanding tasks increased — consuming existing tasks is allowed
        schedAfter.taskCount > schedBefore.taskCount
      ) {
        try {
          console.error(
            '[FASTLANE] schedBefore, schedAfter',
            schedBefore,
            schedAfter
          );

          console.error(
            '[FASTLANE] enqueue logs',
            (globalThis as Record<string, unknown>).__ASKR_ENQUEUE_LOGS
          );
        } catch (e) {
          void e;
        }
        throw new Error(
          'Fast-lane invariant violated: scheduler enqueued leftover work during bulk commit'
        );
      }

      // Final quiescence assertion: ensure scheduler has no pending sync tasks
      let finalState = globalScheduler.getState();
      // Adjust expected task count by subtracting the currently executing task
      // (we're inside that task at the time of this check). The goal is to
      // ensure there are no *other* pending tasks beyond the active execution.
      const executing = globalScheduler.isExecuting();
      const outstandingAfter = Math.max(
        0,
        finalState.taskCount - (executing ? 1 : 0)
      );

      if (outstandingAfter !== 0) {
        // Attempt to clear newly enqueued synchronous tasks that may have
        // been scheduled in microtasks or during remaining flush operations.
        // This loop is conservative and only runs in dev to help catch
        // flaky microtask timing windows; in prod we prefer to fail-safe by
        // dropping such tasks earlier.
        if (process.env.NODE_ENV !== 'production') {
          let attempts = 0;
          while (attempts < 5) {
            const cleared = globalScheduler.clearPendingSyncTasks?.() ?? 0;
            if (cleared === 0) break;
            attempts++;
          }
          finalState = globalScheduler.getState();
          const outstandingAfter2 = Math.max(
            0,
            finalState.taskCount - (globalScheduler.isExecuting() ? 1 : 0)
          );
          if (outstandingAfter2 !== 0) {
            try {
              const _g = globalThis as Record<string, unknown>;

              console.error(
                '[FASTLANE] Post-commit enqueue logs:',
                _g.__ASKR_ENQUEUE_LOGS
              );

              console.error(
                '[FASTLANE] Cleared counts:',
                _g.__ASKR_FASTLANE_CLEARED_TASKS,
                _g.__ASKR_FASTLANE_CLEARED_AFTER
              );
            } catch (err) {
              void err;
            }
            throw new Error(
              `Fast-lane invariant violated: scheduler has ${finalState.taskCount} pending task(s) after commit`
            );
          }
        } else {
          // In production, silently drop remaining synchronous tasks to preserve
          // atomicity and avoid leaving the system in a non-quiescent state.
          globalScheduler.clearPendingSyncTasks?.();
        }
      }
    }

    return true;
  } finally {
    exitBulkCommit();

    // Dev-time: ensure the bulk commit flag was cleared by the end of the operation
    // NOTE: avoid throwing inside `finally` (no-unsafe-finally). Capture the
    // failure and rethrow after the finally block.
    // We set a flag on `globalThis` to check after the finally, which will be
    // handled below.
    if (process.env.NODE_ENV !== 'production') {
      try {
        const _g = globalThis as Record<string, unknown>;
        _g.__ASKR_FASTLANE_BULK_FLAG_CHECK = isBulkCommitActive();
      } catch (e) {
        void e;
      }
    }
  }

  // Re-check the captured assertion outside of finally and throw if needed
  if (process.env.NODE_ENV !== 'production') {
    const _g = globalThis as Record<string, unknown>;
    if ((_g as Record<string, unknown>).__ASKR_FASTLANE_BULK_FLAG_CHECK) {
      delete (_g as Record<string, unknown>).__ASKR_FASTLANE_BULK_FLAG_CHECK;
      throw new Error(
        'Fast-lane invariant violated: bulk commit flag still set after commit'
      );
    }
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
  const _g = globalThis as Record<string, unknown>;
  _g.__ASKR_FASTLANE = {
    isBulkCommitActive,
    enterBulkCommit,
    exitBulkCommit,
    tryRuntimeFastLaneSync,
    markFastPathApplied,
    isFastPathApplied,
  };
}
