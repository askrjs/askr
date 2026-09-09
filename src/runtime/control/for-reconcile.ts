/**
 * For key validation and reconciliation strategy ownership.
 *
 * This module owns validation, the shared setup and epilogue, and the order in
 * which the paths are offered the update. Each path lives in `for-paths/` and
 * either declines (returning `null`) or reports a complete outcome, which
 * `applyOutcome` writes to `forState` in one place.
 */

import type { VNode } from '../../common/vnode';
import { isDevelopmentEnvironment } from '../../common/env';
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

function validateForKeys<T>(
  forState: ForState<T>,
  newArray: readonly T[]
): void {
  if (!isDevelopmentEnvironment()) {
    return;
  }

  const seen = new Set<string | number>();
  const keyKinds = new Map<string | number, 'number' | 'string'>();
  for (let i = 0; i < newArray.length; i++) {
    const key = forState.byFn(newArray[i], i);

    if (key === null || key === undefined) {
      failForValidation(
        '[askr] Invalid For key detected. Keys should be stable, non-null, and unique within a For list.'
      );
    }

    if (seen.has(key)) {
      failForValidation(
        `[askr] Duplicate For key detected: ${String(key)}. Keys should be stable, non-null, and unique within a For list.`
      );
    }

    seen.add(key);

    const keyKind = typeof key;
    const previousKeyKind = forState.devKeyKinds?.get(key);
    if (previousKeyKind && previousKeyKind !== keyKind) {
      failForValidation(
        `[askr] For key type changed for ${String(key)}. Keys must remain consistently typed across renders.`
      );
    }
    keyKinds.set(key, keyKind as 'number' | 'string');
  }

  forState.devKeyKinds = keyKinds;
}

export function reconcileForItems<T>(
  forState: ForState<T>,
  newArray: readonly T[]
): VNode[] {
  forState.currentItems = newArray;
  validateForKeys(forState, newArray);

  if (BENCH_BUILD_ENABLED) {
    resetBenchMetrics();
  }

  const reconcileStartMs = BENCH_BUILD_ENABLED ? performance.now() : 0;

  const { items, orderedKeys, byFn } = forState;
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
      byFn,
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
      byFn,
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
        byFn,
        newLen
      );
      if (removed) return finish(removed);
    }

    const truncated = tryTruncatePath(
      forState,
      newArray,
      items,
      orderedKeys,
      byFn,
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
      byFn,
      oldLen
    );
    if (unmoved) return finish(unmoved);

    const swapped = trySwapPath(
      forState,
      newArray,
      items,
      orderedKeys,
      byFn,
      oldLen
    );
    if (swapped) return finish(swapped);

    const moved = tryMoveOnlyKeyedPath(forState, newArray, items, byFn, oldLen);
    if (moved) return finish(moved);
  }

  return finish(fullKeyedPath(forState, newArray, items, orderedKeys, byFn));
}
