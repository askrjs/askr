import type { VNode } from '../../../common/vnode';
import {
  createItemInstance,
  disposeItemInstance,
  syncForItemIndex,
  updateItemInstance,
  type ForItemInstance,
} from '../for-scopes';
import { recordBenchEvent } from '../../diagnostics/for-bench';
import type { ForState } from '../for-state';
import { setForCommitPending } from './pending';

declare const __ASKR_BENCH_BUILD__: boolean;

const BENCH_BUILD_ENABLED = __ASKR_BENCH_BUILD__;

/**
 * A pure permutation: every new key resolves to an existing, unchanged item
 * whose index signal is either unread or already correct.
 *
 * Commits as FULL_KEYED, but flagged `pendingMoveOnly` so the commit can move
 * the existing nodes instead of rebuilding them.
 *
 * Guarded by `oldLen === newLen`, and runs only after NO_REORDER and SWAP
 * decline.
 */
export function tryMoveOnlyKeyedPath<T>(
  forState: ForState<T>,
  newArray: readonly T[],
  items: ForState<T>['items'],
  byFn: ForState<T>['byFn'],
  oldLen: number
): VNode[] | null {
  const moveOnlyKeys: Array<string | number> = [];
  const moveOnlyItems: ForItemInstance<T>[] = [];
  const moveOnlyVNodes: VNode[] = [];

  for (let i = 0; i < oldLen; i++) {
    const item = newArray[i];
    const key = byFn(item, i);
    const existing = items.get(key);

    if (
      !existing ||
      existing.item !== item ||
      (existing.indexSignal._hasBeenRead && existing.indexSignal.peek() !== i)
    ) {
      return null;
    }

    moveOnlyKeys[i] = key;
    moveOnlyItems[i] = existing;
    moveOnlyVNodes[i] = existing.scope.vnode as VNode;
    recordBenchEvent('itemReused');
  }

  for (let i = 0; i < moveOnlyItems.length; i++) {
    syncForItemIndex(forState, moveOnlyItems[i], i);
    moveOnlyVNodes[i] = moveOnlyItems[i].scope.vnode as VNode;
  }

  forState.orderedKeys = moveOnlyKeys;
  forState.orderedItems = moveOnlyItems;
  forState.orderedVNodes = moveOnlyVNodes;

  setForCommitPending(forState, 'FULL_KEYED', null, null, true);

  return moveOnlyVNodes;
}

/**
 * The general keyed reconciliation every other path declines to handle.
 *
 * One pass over the new array creates, reuses or reindexes each row while
 * tracking which old keys survive; whatever is left over is disposed. Always
 * succeeds, so it takes no guard and returns no `null`.
 */
export function fullKeyedPath<T>(
  forState: ForState<T>,
  newArray: readonly T[],
  items: ForState<T>['items'],
  orderedKeys: Array<string | number>,
  byFn: ForState<T>['byFn']
): VNode[] {
  const toRemove = new Set(orderedKeys);
  const newOrderedKeys: Array<string | number> = [];
  const newOrderedItems: ForItemInstance<T>[] = [];
  const resultVNodes: VNode[] = [];
  let moveOnly = toRemove.size === newArray.length;

  // Single pass: iterate new array directly, no intermediate map
  for (let i = 0; i < newArray.length; i++) {
    const item = newArray[i];
    const key = byFn(item, i);
    if (BENCH_BUILD_ENABLED) {
      recordBenchEvent('keyLookup');
    }

    toRemove.delete(key);
    newOrderedKeys.push(key);

    const existing = items.get(key);
    if (BENCH_BUILD_ENABLED) {
      recordBenchEvent(existing ? 'keyHit' : 'keyMiss');
    }

    if (!existing) {
      // Added: create new item instance
      const itemInstance = createItemInstance(key, item, i, forState);
      items.set(key, itemInstance);
      newOrderedItems.push(itemInstance);
      resultVNodes.push(itemInstance.scope.vnode as VNode);
    } else {
      // Exists: check if item changed (by identity)
      if (BENCH_BUILD_ENABLED) {
        recordBenchEvent('itemReused');
      }
      const itemChanged = existing.item !== item;
      const indexChanged = existing.indexSignal.peek() !== i;

      if (itemChanged) {
        moveOnly = false;
        updateItemInstance(forState, existing, item);
      }

      if (indexChanged) {
        // Index changed: update index signal (triggers re-render if index is used)
        syncForItemIndex(forState, existing, i);
      }

      newOrderedItems.push(existing);
      resultVNodes.push(existing.scope.vnode as VNode);
    }
  }

  // Remove deleted items
  for (const key of toRemove) {
    moveOnly = false;
    const itemInstance = items.get(key);
    if (itemInstance) {
      disposeItemInstance(forState, itemInstance, 'none');
      items.delete(key);
    }
  }

  forState.orderedKeys = newOrderedKeys;
  forState.orderedItems = newOrderedItems;
  forState.orderedVNodes = resultVNodes;

  setForCommitPending(forState, 'FULL_KEYED', null, null, moveOnly);

  return resultVNodes;
}
