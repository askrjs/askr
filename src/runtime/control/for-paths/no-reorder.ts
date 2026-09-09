import type { VNode } from '../../../common/vnode';
import { updateItemInstance } from '../for-scopes';
import { recordBenchEvent } from '../../diagnostics/for-bench';
import type { ForState } from '../for-state';
import { setForCommitPending } from './pending';

/**
 * Same length, same key at every index: an in-place update with no DOM moves.
 *
 * Dirtiness is read from the scope after `updateItemInstance`, so a row whose
 * item is unchanged but whose subtree was invalidated still commits.
 *
 * Guarded by `oldLen === newLen`.
 */
export function tryNoReorderPath<T>(
  forState: ForState<T>,
  newArray: readonly T[],
  items: ForState<T>['items'],
  orderedKeys: Array<string | number>,
  byFn: ForState<T>['byFn'],
  oldLen: number
): VNode[] | null {
  for (let i = 0; i < oldLen; i++) {
    const key = byFn(newArray[i], i);
    if (key !== orderedKeys[i]) {
      return null;
    }
  }

  const resultVNodes = forState.orderedVNodes;
  const resultItems = forState.orderedItems;
  resultVNodes.length = oldLen;
  resultItems.length = oldLen;
  const dirtyIndices: number[] = [];
  // Update in-place only, no DOM moves needed
  for (let i = 0; i < oldLen; i++) {
    const item = newArray[i];
    const key = orderedKeys[i];
    const existing = items.get(key)!;
    const itemChanged = existing.item !== item;

    if (itemChanged) {
      updateItemInstance(forState, existing, item);
    }

    if (existing.scope.needsDomUpdate) {
      dirtyIndices.push(i);
    }

    resultItems[i] = existing;
    resultVNodes[i] = existing.scope.vnode as VNode;
  }

  recordBenchEvent('itemReused', oldLen);

  setForCommitPending(forState, 'NO_REORDER', dirtyIndices, null, false);

  return resultVNodes;
}
