/**
 * For key validation and reconciliation strategy ownership.
 */

import type { VNode } from '../common/vnode';
import { isDevelopmentEnvironment } from '../common/env';
import {
  createItemInstance,
  disposeAllItems,
  disposeFallbackScope,
  disposeItemInstance,
  renderFallbackScope,
  syncForItemIndex,
  updateItemInstance,
  type ForItemInstance,
} from './for-scopes';
import {
  flushBenchMetrics,
  isBenchBuildEnabled,
  recordBenchEvent,
  recordBenchFastLane,
  recordBenchTiming,
  resetBenchMetrics,
} from './for-bench';
import type { ForState } from './for-internal';

const BENCH_BUILD_ENABLED = isBenchBuildEnabled();

function failForValidation(message: string): never {
  throw new Error(message);
}

function validateForKeys<T>(forState: ForState<T>, newArray: T[]): void {
  if (!isDevelopmentEnvironment()) {
    return;
  }

  const seen = new Set<string | number>();
  const keyKinds = new Map<string, 'number' | 'string'>();
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

    const keyString = String(key);
    const keyKind = typeof key;
    const previousKeyKind = forState.devKeyKinds?.get(keyString);
    if (previousKeyKind && previousKeyKind !== keyKind) {
      failForValidation(
        `[askr] For key type changed for ${keyString}. Keys must remain consistently typed across renders.`
      );
    }
    keyKinds.set(keyString, keyKind as 'number' | 'string');
  }

  forState.devKeyKinds = keyKinds;
}

export function reconcileForItems<T>(
  forState: ForState<T>,
  newArray: T[]
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

  // FAST PATH A: APPEND
  // Guard: oldLen <= newLen && all old keys match new keys at same indices
  if (oldLen < newLen) {
    let canUseAppendPath = true;
    for (let i = 0; i < oldLen; i++) {
      const key = byFn(newArray[i], i);
      if (key !== orderedKeys[i]) {
        canUseAppendPath = false;
        break;
      }
    }

    if (canUseAppendPath) {
      recordBenchFastLane('APPEND');
      forState.lastCommitStrategy = 'APPEND';
      const resultVNodes = forState.orderedVNodes;
      const resultItems = forState.orderedItems;
      resultVNodes.length = newLen;
      resultItems.length = newLen;

      // Update existing rows in-place
      for (let i = 0; i < oldLen; i++) {
        const item = newArray[i];
        const key = orderedKeys[i];
        const existing = resultItems[i] ?? items.get(key)!;

        updateItemInstance(forState, existing, item);

        resultItems[i] = existing;
        resultVNodes[i] = existing.scope.vnode as VNode;
      }

      recordBenchEvent('itemReused', oldLen);

      // Create and append new rows
      for (let i = oldLen; i < newLen; i++) {
        const item = newArray[i];
        const key = byFn(item, i);
        const itemInstance = createItemInstance(key, item, i, forState);
        items.set(key, itemInstance);
        resultItems[i] = itemInstance;
        resultVNodes[i] = itemInstance.scope.vnode as VNode;
        orderedKeys[i] = key;
      }

      if (BENCH_BUILD_ENABLED) {
        recordBenchTiming('reconcile', performance.now() - reconcileStartMs);
        flushBenchMetrics();
      }

      forState.orderedVNodes = resultVNodes;
      forState.pendingDirtyIndices = null;
      forState.pendingSwapIndices = null;
      forState.pendingMoveOnly = false;

      return resultVNodes;
    }
  }

  // FAST PATH B: TRUNCATE
  // Guard: newLen <= oldLen && all new keys match old keys at same indices
  if (newLen < oldLen) {
    if (oldLen === newLen + 1) {
      let removedIndex = -1;

      for (let i = 0; i < newLen; i++) {
        const nextKey = byFn(newArray[i], i);
        if (nextKey !== orderedKeys[i]) {
          removedIndex = i;
          break;
        }
      }

      if (removedIndex !== -1) {
        let canUseRemoveOnePath = true;
        for (let i = removedIndex; i < newLen; i++) {
          const nextKey = byFn(newArray[i], i);
          if (nextKey !== orderedKeys[i + 1]) {
            canUseRemoveOnePath = false;
            break;
          }
        }

        if (canUseRemoveOnePath) {
          recordBenchFastLane('REMOVE_ONE');
          forState.lastCommitStrategy = 'NO_REORDER';

          const previousOrderedItems = forState.orderedItems.slice();
          const resultVNodes = forState.orderedVNodes;
          const resultItems = forState.orderedItems;
          resultVNodes.length = newLen;
          resultItems.length = newLen;
          const dirtyIndices: number[] = [];

          for (let i = 0; i < newLen; i++) {
            const item = newArray[i];
            const key = i < removedIndex ? orderedKeys[i] : orderedKeys[i + 1];
            const existing = items.get(key)!;
            const scopeNeedsDomUpdate = existing.scope.needsDomUpdate;

            const itemChanged = existing.item !== item;
            const indexSignal = existing.indexSignal;
            const indexChanged = indexSignal.peek() !== i;

            if (itemChanged) {
              updateItemInstance(forState, existing, item);
            }

            const indexVisibleChange = indexChanged
              ? syncForItemIndex(forState, existing, i)
              : false;

            if (itemChanged || indexVisibleChange || scopeNeedsDomUpdate) {
              dirtyIndices.push(i);
            }

            resultItems[i] = existing;
            resultVNodes[i] = existing.scope.vnode as VNode;
          }

          recordBenchEvent('itemReused', newLen);

          const removedKey = orderedKeys[removedIndex];
          const removedItem = items.get(removedKey);
          if (removedItem) {
            disposeItemInstance(forState, removedItem, 'teardown');
            items.delete(removedKey);
          }

          const nextOrderedKeys = orderedKeys.slice(0, newLen);
          const nextOrderedItems = previousOrderedItems.slice(0, newLen);
          for (let i = removedIndex; i < newLen; i++) {
            nextOrderedKeys[i] = orderedKeys[i + 1];
            nextOrderedItems[i] = previousOrderedItems[i + 1];
          }
          forState.orderedKeys = nextOrderedKeys;
          forState.orderedItems = nextOrderedItems;

          if (BENCH_BUILD_ENABLED) {
            recordBenchTiming(
              'reconcile',
              performance.now() - reconcileStartMs
            );
            flushBenchMetrics();
          }

          forState.pendingDirtyIndices = dirtyIndices;
          forState.pendingSwapIndices = null;
          forState.pendingMoveOnly = false;

          return resultVNodes;
        }
      }
    }

    let canUseTruncatePath = true;
    for (let i = 0; i < newLen; i++) {
      const key = byFn(newArray[i], i);
      if (key !== orderedKeys[i]) {
        canUseTruncatePath = false;
        break;
      }
    }

    if (canUseTruncatePath) {
      recordBenchFastLane('TRUNCATE');
      forState.lastCommitStrategy = 'TRUNCATE';
      const resultVNodes = forState.orderedVNodes;
      const resultItems = forState.orderedItems;
      resultVNodes.length = newLen;
      resultItems.length = newLen;
      const isFullClear = newLen === 0;

      // Update existing rows in-place
      for (let i = 0; i < newLen; i++) {
        const item = newArray[i];
        const key = orderedKeys[i];
        const existing = items.get(key)!;

        updateItemInstance(forState, existing, item);

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

      if (BENCH_BUILD_ENABLED) {
        recordBenchTiming('reconcile', performance.now() - reconcileStartMs);
        flushBenchMetrics();
      }

      forState.orderedVNodes = resultVNodes;
      forState.pendingDirtyIndices = null;
      forState.pendingSwapIndices = null;
      forState.pendingMoveOnly = false;

      return resultVNodes;
    }
  }

  // FAST PATH C: NO-REORDER (in-place update only)
  // Guard: oldLen === newLen && keys match at all indices
  if (oldLen === newLen) {
    let canUseNoReorderPath = true;
    for (let i = 0; i < oldLen; i++) {
      const key = byFn(newArray[i], i);
      if (key !== orderedKeys[i]) {
        canUseNoReorderPath = false;
        break;
      }
    }

    if (canUseNoReorderPath) {
      recordBenchFastLane('NO_REORDER');
      forState.lastCommitStrategy = 'NO_REORDER';
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

        if (!itemChanged && existing.scope.needsDomUpdate) {
          dirtyIndices.push(i);
        }

        resultItems[i] = existing;
        resultVNodes[i] = existing.scope.vnode as VNode;
      }

      recordBenchEvent('itemReused', oldLen);

      if (BENCH_BUILD_ENABLED) {
        recordBenchTiming('reconcile', performance.now() - reconcileStartMs);
        flushBenchMetrics();
      }

      forState.pendingDirtyIndices = dirtyIndices;
      forState.pendingSwapIndices = null;
      forState.pendingMoveOnly = false;

      return resultVNodes;
    }

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
        if (existing && existing.item !== item) {
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
      canUseSwapPath &&
      mismatchCount === 2 &&
      firstMismatch !== -1 &&
      secondMismatch !== -1 &&
      firstMismatchKey === orderedKeys[secondMismatch] &&
      secondMismatchKey === orderedKeys[firstMismatch]
    ) {
      recordBenchFastLane('SWAP');
      recordBenchEvent('itemMoved');
      recordBenchEvent('itemMoved');

      forState.lastCommitStrategy = 'SWAP';

      const nextOrderedKeys = orderedKeys.slice();
      nextOrderedKeys[firstMismatch] = firstMismatchKey;
      nextOrderedKeys[secondMismatch] = secondMismatchKey;

      const resultVNodes = forState.orderedVNodes;
      const firstExisting = items.get(firstMismatchKey)!;
      const secondExisting = items.get(secondMismatchKey)!;
      const firstItem = newArray[firstMismatch];
      const secondItem = newArray[secondMismatch];
      const nextOrderedItems = forState.orderedItems.slice();
      nextOrderedItems[firstMismatch] = secondExisting;
      nextOrderedItems[secondMismatch] = firstExisting;

      recordBenchEvent('itemReused');
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

      if (BENCH_BUILD_ENABLED) {
        recordBenchTiming('reconcile', performance.now() - reconcileStartMs);
        flushBenchMetrics();
      }

      forState.pendingDirtyIndices = null;
      forState.pendingSwapIndices = [firstMismatch, secondMismatch];
      forState.pendingMoveOnly = true;

      return resultVNodes;
    }

    let canUseMoveOnlyPath = true;
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
        canUseMoveOnlyPath = false;
        break;
      }

      moveOnlyKeys[i] = key;
      moveOnlyItems[i] = existing;
      moveOnlyVNodes[i] = existing.scope.vnode as VNode;
      recordBenchEvent('itemReused');
    }

    if (canUseMoveOnlyPath) {
      recordBenchFastLane('FULL_KEYED');
      forState.lastCommitStrategy = 'FULL_KEYED';

      for (let i = 0; i < moveOnlyItems.length; i++) {
        syncForItemIndex(forState, moveOnlyItems[i], i);
        moveOnlyVNodes[i] = moveOnlyItems[i].scope.vnode as VNode;
      }

      forState.orderedKeys = moveOnlyKeys;
      forState.orderedItems = moveOnlyItems;
      forState.orderedVNodes = moveOnlyVNodes;

      if (BENCH_BUILD_ENABLED) {
        recordBenchTiming('reconcile', performance.now() - reconcileStartMs);
        flushBenchMetrics();
      }

      forState.pendingDirtyIndices = null;
      forState.pendingSwapIndices = null;
      forState.pendingMoveOnly = true;

      return moveOnlyVNodes;
    }
  }

  // FULL KEYED RECONCILIATION (slow path for complex reorders)
  // Avoid allocating newKeyMap: iterate directly and track removals
  recordBenchFastLane('FULL_KEYED');
  forState.lastCommitStrategy = 'FULL_KEYED';

  const toRemove = new Set(orderedKeys);
  const newOrderedKeys: Array<string | number> = [];
  const newOrderedItems: ForItemInstance<T>[] = [];
  const resultVNodes: VNode[] = [];
  let moveOnly = toRemove.size === newArray.length;

  // Single pass: iterate new array directly, no intermediate map
  for (let i = 0; i < newArray.length; i++) {
    const item = newArray[i];
    const key = byFn(item, i);
    recordBenchEvent('keyLookup');

    toRemove.delete(key);
    newOrderedKeys.push(key);

    const existing = items.get(key);
    recordBenchEvent(existing ? 'keyHit' : 'keyMiss');

    if (!existing) {
      // Added: create new item instance
      const itemInstance = createItemInstance(key, item, i, forState);
      items.set(key, itemInstance);
      newOrderedItems.push(itemInstance);
      resultVNodes.push(itemInstance.scope.vnode as VNode);
    } else {
      // Exists: check if item changed (by identity)
      recordBenchEvent('itemReused');
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

  // Record reconcile timing
  if (BENCH_BUILD_ENABLED) {
    recordBenchTiming('reconcile', performance.now() - reconcileStartMs);
    flushBenchMetrics();
  }

  forState.orderedVNodes = resultVNodes;
  forState.pendingDirtyIndices = null;
  forState.pendingSwapIndices = null;
  forState.pendingMoveOnly = moveOnly;

  return resultVNodes;
}
