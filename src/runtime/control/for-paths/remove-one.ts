import type { VNode } from '../../../common/vnode';
import {
  disposeItemInstance,
  syncForItemIndex,
  updateItemInstance,
} from '../for-scopes';
import {
  recordBenchCounter,
  recordBenchEvent,
  recordBenchTiming,
} from '../../diagnostics/for-bench';
import type { ForState } from '../for-state';
import { setForCommitPending } from './pending';

declare const __ASKR_BENCH_BUILD__: boolean;

const BENCH_BUILD_ENABLED = __ASKR_BENCH_BUILD__;

/**
 * Exactly one row removed, the suffix shifted up by one.
 *
 * The shifted suffix keeps its instances; only rows whose item or index
 * actually changed land in the dirty list. `pendingRemovedKey` tells the commit
 * which keyed-map entry to drop, and the commit detaches that node before
 * applying the plan so dirty rows anchor on post-removal indices.
 *
 * Guarded by `oldLen === newLen + 1`.
 */
export function tryRemoveOnePath<T>(
  forState: ForState<T>,
  newArray: readonly T[],
  items: ForState<T>['items'],
  orderedKeys: Array<string | number>,
  byFn: ForState<T>['byFn'],
  newLen: number
): VNode[] | null {
  const removeValidationStartMs = BENCH_BUILD_ENABLED ? performance.now() : 0;
  let removedIndex = -1;

  for (let i = 0; i < newLen; i++) {
    const nextKey = byFn(newArray[i], i);
    if (nextKey !== orderedKeys[i]) {
      removedIndex = i;
      break;
    }
  }

  if (removedIndex === -1) {
    return null;
  }

  for (let i = removedIndex; i < newLen; i++) {
    const nextKey = byFn(newArray[i], i);
    if (nextKey !== orderedKeys[i + 1]) {
      return null;
    }
  }

  if (BENCH_BUILD_ENABLED) {
    recordBenchTiming(
      'removeValidation',
      performance.now() - removeValidationStartMs
    );
  }

  const resultVNodes = forState.orderedVNodes;
  const resultItems = forState.orderedItems;
  const removedKey = orderedKeys[removedIndex];
  const removedItem = resultItems[removedIndex] ?? items.get(removedKey);

  const collectionMutationStartMs = BENCH_BUILD_ENABLED ? performance.now() : 0;
  orderedKeys.copyWithin(removedIndex, removedIndex + 1);
  resultItems.copyWithin(removedIndex, removedIndex + 1);
  resultVNodes.copyWithin(removedIndex, removedIndex + 1);
  orderedKeys.length = newLen;
  resultItems.length = newLen;
  resultVNodes.length = newLen;
  if (BENCH_BUILD_ENABLED) {
    recordBenchTiming(
      'collectionMutation',
      performance.now() - collectionMutationStartMs
    );
  }
  const dirtyIndices: number[] = [];
  const suffixSyncStartMs = BENCH_BUILD_ENABLED ? performance.now() : 0;

  for (let i = 0; i < newLen; i++) {
    const item = newArray[i];
    const existing = resultItems[i];
    const scopeNeedsDomUpdate = existing.scope.needsDomUpdate;

    const itemChanged = existing.item !== item;
    const indexSignal = existing.indexSignal;
    const indexChanged = i >= removedIndex && indexSignal.peek() !== i;

    if (itemChanged) {
      updateItemInstance(forState, existing, item);
    }

    const indexVisibleChange = indexChanged
      ? syncForItemIndex(forState, existing, i)
      : false;
    if (BENCH_BUILD_ENABLED && i >= removedIndex) {
      recordBenchCounter('shiftedItemsVisited');
      if (indexChanged) recordBenchCounter('indexSignalsUpdated');
    }

    if (itemChanged || indexVisibleChange || scopeNeedsDomUpdate) {
      dirtyIndices.push(i);
    }

    resultVNodes[i] = existing.scope.vnode as VNode;
  }
  if (BENCH_BUILD_ENABLED) {
    recordBenchTiming(
      'shiftedSuffixSync',
      performance.now() - suffixSyncStartMs
    );
  }

  if (BENCH_BUILD_ENABLED) {
    recordBenchEvent('itemReused', newLen);
  }

  if (removedItem) {
    disposeItemInstance(forState, removedItem, 'teardown');
    items.delete(removedKey);
  }

  setForCommitPending(forState, 'REMOVE_ONE', dirtyIndices, null, false);
  forState.pendingRemovedKey = removedKey;

  return resultVNodes;
}
