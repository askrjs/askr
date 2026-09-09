import type { VNode } from '../../../common/vnode';
import { createItemInstance, syncForItemIndex } from '../for-scopes';
import { recordBenchEvent } from '../../diagnostics/for-bench';
import type { ForState } from '../for-state';
import { setForCommitPending } from './pending';

/**
 * One row inserted, every existing DOM node retained.
 *
 * Requires that no shifted row has read its index signal and that no retained
 * row is already dirty: this path only syncs the inserted index, so a pending
 * update anywhere else would be silently dropped. Every other shape falls
 * through to the general keyed path.
 *
 * Guarded by `newLen === oldLen + 1`.
 */
export function tryInsertOnePath<T>(
  forState: ForState<T>,
  newArray: readonly T[],
  items: ForState<T>['items'],
  orderedKeys: Array<string | number>,
  byFn: ForState<T>['byFn'],
  oldLen: number,
  newLen: number
): VNode[] | null {
  let oldIndex = 0;
  let insertedIndex = -1;
  let insertedKey: string | number | null = null;

  for (let newIndex = 0; newIndex < newLen; newIndex++) {
    const item = newArray[newIndex];
    const key = byFn(item, newIndex);
    const expectedKey = orderedKeys[oldIndex];

    if (oldIndex < oldLen && key === expectedKey) {
      const existing = items.get(key);
      if (
        !existing ||
        existing.item !== item ||
        existing.scope.needsDomUpdate ||
        (oldIndex !== newIndex && existing.indexSignal._hasBeenRead)
      ) {
        insertedIndex = -2;
        break;
      }
      oldIndex++;
    } else if (insertedIndex === -1 && !items.has(key)) {
      insertedIndex = newIndex;
      insertedKey = key;
    } else {
      insertedIndex = -2;
      break;
    }
  }

  if (!(insertedIndex >= 0 && oldIndex === oldLen && insertedKey !== null)) {
    return null;
  }

  const insertedItem = createItemInstance(
    insertedKey,
    newArray[insertedIndex],
    insertedIndex,
    forState
  );
  const resultVNodes = forState.orderedVNodes.slice();
  const resultItems = forState.orderedItems.slice();
  const resultKeys = orderedKeys.slice();

  resultVNodes.splice(insertedIndex, 0, insertedItem.scope.vnode as VNode);
  resultItems.splice(insertedIndex, 0, insertedItem);
  resultKeys.splice(insertedIndex, 0, insertedKey);
  items.set(insertedKey, insertedItem);

  recordBenchEvent('itemReused', oldLen);
  forState.orderedKeys = resultKeys;
  forState.orderedItems = resultItems;
  forState.orderedVNodes = resultVNodes;
  for (let index = insertedIndex; index < resultItems.length; index += 1) {
    syncForItemIndex(forState, resultItems[index]!, index);
  }

  setForCommitPending(forState, 'INSERT_ONE', null, null, false);
  forState.pendingInsertedIndex = insertedIndex;

  return resultVNodes;
}
