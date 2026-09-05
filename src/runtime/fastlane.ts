import { isDevelopmentEnvironment } from '../common/env';
import {
  getRuntimeRenderer,
  getRuntimeSchedulerState,
  runRuntimeWithSyncProgress,
  setRuntimeBulkCommitProbe,
} from './access';
import type { ComponentInstance } from './component';
import {
  finalizeReadableSubscriptions,
  markReadableDerivedSubscribersDirty,
  markReactivePropsDirtySource,
  notifyReadableReaders,
  type ReadableSource,
} from './readable';
import { setDevValue, getDevValue, getDevNamespace } from './dev-namespace';

declare const __ASKR_DEVELOPMENT_BUILD__: boolean;

const DEVELOPMENT_BUILD_ENABLED = __ASKR_DEVELOPMENT_BUILD__;

let _bulkCommitActive = false;
let _bulkCommitDepth = 0;
let _appliedParents: WeakSet<Element> | null = null;
let _deferredReadableSources: Set<ReadableSource<unknown>> | null = null;

export function enterBulkCommit(): void {
  _bulkCommitDepth += 1;
  if (_bulkCommitDepth > 1) return;

  _bulkCommitActive = true;
  // Initialize registry of parents that had fast-path applied during this bulk commit
  _appliedParents = new WeakSet<Element>();
  _deferredReadableSources = new Set<ReadableSource<unknown>>();
  setDevValue('__FASTLANE_CLEARED_TASKS', 0);
}

export function exitBulkCommit(): void {
  if (_bulkCommitDepth === 0) return;

  _bulkCommitDepth -= 1;
  if (_bulkCommitDepth > 0) return;

  _bulkCommitActive = false;
  const deferredReadableSources = _deferredReadableSources;
  // Clear registry to avoid leaking across commits
  _appliedParents = null;
  _deferredReadableSources = null;

  if (!deferredReadableSources) return;
  for (const source of deferredReadableSources) {
    markReadableDerivedSubscribersDirty(source);
    markReactivePropsDirtySource(source);
    void notifyReadableReaders(source);
  }
}

export function isBulkCommitActive(): boolean {
  return _bulkCommitActive;
}

export function deferBulkCommitReadableNotification(
  source: ReadableSource<unknown>
): void {
  _deferredReadableSources?.add(source);
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
  finalizeReadableSubscriptions(instance);
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
  return getRuntimeRenderer().classifyComponentUpdate(instance, result);
}

export function commitReorderOnly(
  instance: ComponentInstance,
  result: unknown
): boolean {
  // Performs the minimal, synchronous reorder-only commit.
  const renderer = getRuntimeRenderer();

  const schedBefore =
    DEVELOPMENT_BUILD_ENABLED && isDevelopmentEnvironment()
      ? getRuntimeSchedulerState()
      : null;

  enterBulkCommit();

  try {
    runRuntimeWithSyncProgress(() => {
      renderer.evaluate(result, instance.target);

      // Finalize runtime bookkeeping (read subscriptions / tokens)
      try {
        finalizeReadSubscriptions(instance);
      } catch (e) {
        if (isDevelopmentEnvironment()) throw e;
      }
    });

    setDevValue('__FASTLANE_CLEARED_AFTER', 0);

    // Dev-only invariant checks
    if (DEVELOPMENT_BUILD_ENABLED && isDevelopmentEnvironment()) {
      validateFastLaneInvariants(instance, schedBefore);
    }

    return true;
  } finally {
    // Clear bulk commit flag first
    exitBulkCommit();
  }
  // Note: The original code had a check here that was dead code because
  // exitBulkCommit() already ran in the finally block. This comment serves
  // as documentation that we've intentionally removed that unreachable code.
}

/**
 * Validates fast-lane invariants in dev mode.
 * Extracted to reduce complexity in commitReorderOnly.
 */
function validateFastLaneInvariants(
  instance: ComponentInstance,
  schedBefore: ReturnType<typeof getRuntimeSchedulerState> | null
): void {
  const commitCount = getDevValue<number>('__LAST_FASTPATH_COMMIT_COUNT') ?? 0;
  const invariants = {
    commitCount,
    mountOps: instance.mountOperations?.length ?? 0,
    commitOps: instance.commitOperations?.length ?? 0,
    cleanupFns: instance.ownership.cleanups?.length ?? 0,
  };
  setDevValue('__LAST_FASTLANE_INVARIANTS', invariants);

  if (commitCount !== 1) {
    console.error(
      '[FASTLANE][INV] commitCount',
      commitCount,
      'diag',
      getDevNamespace()
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

  if (invariants.commitOps > 0) {
    throw new Error(
      'Fast-lane invariant violated: lifecycle commit operations were registered during bulk commit'
    );
  }

  if (invariants.cleanupFns > 0) {
    throw new Error(
      'Fast-lane invariant violated: cleanup functions were added during bulk commit'
    );
  }

  const schedAfter = getRuntimeSchedulerState();
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
    if (isDevelopmentEnvironment()) throw err;
    return false;
  }
}

setRuntimeBulkCommitProbe(isBulkCommitActive);
