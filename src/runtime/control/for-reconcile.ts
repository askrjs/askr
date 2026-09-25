/**
 * For key validation and reconciliation strategy ownership.
 *
 * This module owns validation, the shared setup and epilogue, and the order in
 * which the paths are offered the update. Each path lives in `for-paths/` and
 * either declines (returning `null`) or reports a complete outcome, which
 * `applyOutcome` writes to `forState` in one place.
 */

import type { VNode } from '../../common/vnode';
import {
  disposeAllItems,
  disposeFallbackScope,
  renderFallbackScope,
} from './for-scopes';
import {
  flushBenchMetrics,
  recordBenchFastLane,
  recordBenchTiming,
  resetBenchMetrics,
} from '../diagnostics/for-bench';
import type { ForState } from './for-state';
import { tryAppendPath } from './for-paths/append';
import { fullKeyedPath, tryMoveOnlyKeyedPath } from './for-paths/full-keyed';
import { tryInsertOnePath } from './for-paths/insert-one';
import { tryNoReorderPath } from './for-paths/no-reorder';
import { tryRemoveOnePath } from './for-paths/remove-one';
import { trySwapPath } from './for-paths/swap';
import { tryTruncatePath } from './for-paths/truncate';

declare const __ASKR_BENCH_BUILD__: boolean;

const BENCH_BUILD_ENABLED = __ASKR_BENCH_BUILD__;

function failForValidation(message: string): never {
  throw new Error(message);
}

/**
 * Resolve every row key once per pass and reject null and duplicate keys in
 * every build: rows are addressed by key, so reconciling a violation would
 * silently drop or merge rows. The reconciliation paths read the returned keys
 * instead of calling `by` again.
 */
function resolveForKeys<T>(
  forState: ForState<T>,
  newArray: readonly T[]
): Array<string | number> {
  const { byFn, orderedKeys } = forState;
  const newLen = newArray.length;
  const keys: Array<string | number> = [];
  // The committed keys are unique, so keys that match a prefix of them in order
  // cannot contain a duplicate; only build the lookup set once they diverge.
  let seen: Set<string | number> | null = null;

  for (let i = 0; i < newLen; i++) {
    const key = byFn(newArray[i], i);

    if (key === null || key === undefined) {
      failForValidation(
        '[askr] Invalid For key detected. Keys should be stable, non-null, and unique within a For list.'
      );
    }

    if (!seen && (i >= orderedKeys.length || key !== orderedKeys[i])) {
      seen = new Set(keys);
    }

    if (seen) {
      if (seen.has(key)) {
        failForValidation(
          `[askr] Duplicate For key detected: ${String(key)}. Keys should be stable, non-null, and unique within a For list.`
        );
      }
      seen.add(key);
    }

    keys.push(key);
  }

  return keys;
}

export function reconcileForItems<T>(
  forState: ForState<T>,
  newArray: readonly T[]
): VNode[] {
  forState.currentItems = newArray;
  const keys = resolveForKeys(forState, newArray);

  if (BENCH_BUILD_ENABLED) {
    resetBenchMetrics();
  }

  const reconcileStartMs = BENCH_BUILD_ENABLED ? performance.now() : 0;

  const { items, orderedKeys } = forState;
  const oldLen = orderedKeys.length;
  const newLen = newArray.length;
  forState.lastRemovedNodes = [];
  forState.lastRemovedRanges = [];
  forState.pendingRemovedKey = null;

  if (newLen === 0) {
    if (oldLen > 0) {
      disposeAllItems(forState, forState.fallback ? 'teardown' : 'none');
    }
    recordBenchFastLane('TRUNCATE');
    forState.lastCommitStrategy = 'TRUNCATE';
    forState.pendingDirtyIndices = null;
    forState.pendingSwapIndices = null;
    forState.pendingMoveOnly = false;

    if (BENCH_BUILD_ENABLED) {
      recordBenchTiming('reconcile', performance.now() - reconcileStartMs);
      flushBenchMetrics();
    }

    return renderFallbackScope(forState);
  }

  if (forState.fallbackScope) {
    disposeFallbackScope(forState, 'none');
  }

  /** Close out the pass. Each path has already published its own decision. */
  const finish = (vnodes: VNode[]): VNode[] => {
    if (BENCH_BUILD_ENABLED) {
      recordBenchTiming('reconcile', performance.now() - reconcileStartMs);
      flushBenchMetrics();
    }
    return vnodes;
  };

  // Order is load-bearing. INSERT_ONE probes before the length-based paths, and
  // REMOVE_ONE probes ahead of TRUNCATE, because each is a cheaper special case
  // of the path that follows it.
  if (newLen === oldLen + 1) {
    const inserted = tryInsertOnePath(
      forState,
      newArray,
      items,
      orderedKeys,
      keys,
      oldLen,
      newLen
    );
    if (inserted) return finish(inserted);
  }

  if (oldLen < newLen) {
    const appended = tryAppendPath(
      forState,
      newArray,
      items,
      orderedKeys,
      keys,
      oldLen,
      newLen
    );
    if (appended) return finish(appended);
  }

  if (newLen < oldLen) {
    if (oldLen === newLen + 1) {
      const removed = tryRemoveOnePath(
        forState,
        newArray,
        items,
        orderedKeys,
        keys,
        newLen
      );
      if (removed) return finish(removed);
    }

    const truncated = tryTruncatePath(
      forState,
      newArray,
      items,
      orderedKeys,
      keys,
      oldLen,
      newLen
    );
    if (truncated) return finish(truncated);
  }

  if (oldLen === newLen) {
    const unmoved = tryNoReorderPath(
      forState,
      newArray,
      items,
      orderedKeys,
      keys,
      oldLen
    );
    if (unmoved) return finish(unmoved);

    const swapped = trySwapPath(
      forState,
      newArray,
      items,
      orderedKeys,
      keys,
      oldLen
    );
    if (swapped) return finish(swapped);

    const moved = tryMoveOnlyKeyedPath(forState, newArray, items, keys, oldLen);
    if (moved) return finish(moved);
  }

  return finish(fullKeyedPath(forState, newArray, items, orderedKeys, keys));
}
