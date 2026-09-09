import type { VNode } from '../../../common/vnode';
import { disposeItemInstance, updateItemInstance } from '../for-scopes';
import { recordBenchEvent } from '../../diagnostics/for-bench';
import { getRuntimeScopes } from '../../access';
import type { ForState } from '../for-state';
import { setForCommitPending } from './pending';

/**
 * The tail dropped, the surviving prefix keeping its keys and positions.
 *
 * Survivors are updated in place; the removed tail is disposed here, so the
 * commit only has to patch the dirty survivors and detach the orphaned nodes.
 * A survivor also counts as dirty when its component host was unmounted out
 * from under it.
 *
 * Guarded by `newLen < oldLen`.
 */
export function tryTruncatePath<T>(
  forState: ForState<T>,
  newArray: readonly T[],
  items: ForState<T>['items'],
  orderedKeys: Array<string | number>,
  byFn: ForState<T>['byFn'],
  oldLen: number,
  newLen: number
): VNode[] | null {
  for (let i = 0; i < newLen; i++) {
    const key = byFn(newArray[i], i);
    if (key !== orderedKeys[i]) {
      return null;
    }
  }

  const resultVNodes = forState.orderedVNodes;
  const resultItems = forState.orderedItems;
  resultVNodes.length = newLen;
  resultItems.length = newLen;
  const isFullClear = newLen === 0;
  const dirtyIndices: number[] = [];

  // Update existing rows in-place
  for (let i = 0; i < newLen; i++) {
    const item = newArray[i];
    const key = orderedKeys[i];
    const existing = items.get(key)!;
    const itemChanged = existing.item !== item;
    const scopeNeedsDomUpdate =
      existing.scope.needsDomUpdate ||
      getRuntimeScopes().hasUnmountedComponentHost(existing.scope.dom);

    if (itemChanged) {
      updateItemInstance(forState, existing, item);
    }

    if (itemChanged || scopeNeedsDomUpdate) {
      dirtyIndices.push(i);
    }

    resultItems[i] = existing;
    resultVNodes[i] = existing.scope.vnode as VNode;
  }

  recordBenchEvent('itemReused', newLen);

  // Remove tail rows
  for (let i = newLen; i < oldLen; i++) {
    const key = orderedKeys[i];
    const itemInstance = items.get(key);
    if (itemInstance) {
      disposeItemInstance(
        forState,
        itemInstance,
        isFullClear ? 'full-clear' : 'teardown'
      );
      items.delete(key);
    }
  }

  orderedKeys.length = newLen;
  forState.orderedKeys = orderedKeys;
  forState.orderedItems.length = newLen;
  forState.orderedVNodes = resultVNodes;

  setForCommitPending(forState, 'TRUNCATE', dirtyIndices, null, false);

  return resultVNodes;
}
