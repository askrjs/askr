import type { VNode } from '../../../common/vnode';
import { syncForItemIndex, updateItemInstance } from '../for-scopes';
import { recordBenchEvent } from '../../diagnostics/for-bench';
import type { ForState } from '../for-state';
import { setForCommitPending } from './pending';

declare const __ASKR_BENCH_BUILD__: boolean;

const BENCH_BUILD_ENABLED = __ASKR_BENCH_BUILD__;

/**
 * Exactly two rows exchanged, everything else untouched.
 *
 * Bails when any key-matched row already carries a pending DOM update: SWAP
 * only ever syncs the two swapped indices, so such a row would silently lose
 * its update. This mirrors the INSERT_ONE guard.
 *
 * Guarded by `oldLen === newLen`, and runs only after NO_REORDER declines.
 */
export function trySwapPath<T>(
  forState: ForState<T>,
  newArray: readonly T[],
  items: ForState<T>['items'],
  orderedKeys: Array<string | number>,
  byFn: ForState<T>['byFn'],
  oldLen: number
): VNode[] | null {
  let firstMismatch = -1;
  let secondMismatch = -1;
  let firstMismatchKey: string | number | null = null;
  let secondMismatchKey: string | number | null = null;
  let mismatchCount = 0;
  let canUseSwapPath = true;

  for (let i = 0; i < oldLen; i++) {
    const item = newArray[i];
    const key = byFn(newArray[i], i);
    if (key === orderedKeys[i]) {
      const existing = items.get(key);
      if (
        existing &&
        (existing.item !== item || existing.scope.needsDomUpdate)
      ) {
        canUseSwapPath = false;
        break;
      }
      continue;
    }

    mismatchCount++;
    if (firstMismatch === -1) {
      firstMismatch = i;
      firstMismatchKey = key;
      continue;
    }

    if (secondMismatch === -1) {
      secondMismatch = i;
      secondMismatchKey = key;
      continue;
    }

    mismatchCount = 3;
    break;
  }

  if (
    !(
      canUseSwapPath &&
      mismatchCount === 2 &&
      firstMismatch !== -1 &&
      secondMismatch !== -1 &&
      firstMismatchKey === orderedKeys[secondMismatch] &&
      secondMismatchKey === orderedKeys[firstMismatch]
    )
  ) {
    return null;
  }

  recordBenchEvent('itemMoved');
  recordBenchEvent('itemMoved');

  const nextOrderedKeys = orderedKeys.slice();
  nextOrderedKeys[firstMismatch] = firstMismatchKey;
  nextOrderedKeys[secondMismatch] = secondMismatchKey;

  const resultVNodes = forState.orderedVNodes;
  const firstExisting = items.get(firstMismatchKey)!;
  const secondExisting = items.get(secondMismatchKey)!;
  const firstItem = newArray[firstMismatch];
  const secondItem = newArray[secondMismatch];
  const nextOrderedItems = forState.orderedItems.slice();
  nextOrderedItems[firstMismatch] = firstExisting;
  nextOrderedItems[secondMismatch] = secondExisting;

  if (BENCH_BUILD_ENABLED) {
    recordBenchEvent('itemReused');
  }
  recordBenchEvent('itemReused');

  if (firstExisting.item !== firstItem) {
    updateItemInstance(forState, firstExisting, firstItem);
  }

  if (secondExisting.item !== secondItem) {
    updateItemInstance(forState, secondExisting, secondItem);
  }

  syncForItemIndex(forState, firstExisting, firstMismatch);

  syncForItemIndex(forState, secondExisting, secondMismatch);

  resultVNodes[firstMismatch] = firstExisting.scope.vnode as VNode;
  resultVNodes[secondMismatch] = secondExisting.scope.vnode as VNode;

  forState.orderedKeys = nextOrderedKeys;
  forState.orderedItems = nextOrderedItems;

  setForCommitPending(
    forState,
    'SWAP',
    null,
    [firstMismatch, secondMismatch],
    true
  );

  return resultVNodes;
}
