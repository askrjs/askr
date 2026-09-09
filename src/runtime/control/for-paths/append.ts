import type { VNode } from '../../../common/vnode';
import { createItemInstance, updateItemInstance } from '../for-scopes';
import { recordBenchEvent } from '../../diagnostics/for-bench';
import type { ForState } from '../for-state';
import { setForCommitPending } from './pending';

declare const __ASKR_BENCH_BUILD__: boolean;

const BENCH_BUILD_ENABLED = __ASKR_BENCH_BUILD__;

/**
 * Rows added at the tail, every existing key still at its own index.
 *
 * When the retained prefix is also clean the commit can skip it entirely, which
 * `pendingAppendStart` reports; otherwise the prefix is updated in place and the
 * commit starts from zero.
 *
 * Guarded by `oldLen < newLen`.
 */
export function tryAppendPath<T>(
  forState: ForState<T>,
  newArray: readonly T[],
  items: ForState<T>['items'],
  orderedKeys: Array<string | number>,
  byFn: ForState<T>['byFn'],
  oldLen: number,
  newLen: number
): VNode[] | null {
  let canUseAppendPath = true;
  let canSkipCommittedPrefix = true;
  for (let i = 0; i < oldLen; i++) {
    const key = byFn(newArray[i], i);
    if (key !== orderedKeys[i]) {
      canUseAppendPath = false;
      break;
    }

    const existing = forState.orderedItems[i] ?? items.get(key);
    if (
      !existing ||
      existing.item !== newArray[i] ||
      existing.scope.needsDomUpdate ||
      existing.scope.hydrationPending
    ) {
      canSkipCommittedPrefix = false;
    }
  }

  if (!canUseAppendPath) {
    return null;
  }

  const resultVNodes = forState.orderedVNodes;
  const resultItems = forState.orderedItems;
  resultVNodes.length = newLen;
  resultItems.length = newLen;

  // Update existing rows in-place
  if (!canSkipCommittedPrefix) {
    for (let i = 0; i < oldLen; i++) {
      const item = newArray[i];
      const key = orderedKeys[i];
      const existing = resultItems[i] ?? items.get(key)!;

      updateItemInstance(forState, existing, item);

      resultItems[i] = existing;
      resultVNodes[i] = existing.scope.vnode as VNode;
    }
  }

  if (BENCH_BUILD_ENABLED) {
    recordBenchEvent('itemReused', oldLen);
  }

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

  forState.orderedVNodes = resultVNodes;

  setForCommitPending(forState, 'APPEND', null, null, false);
  forState.pendingAppendStart = canSkipCommittedPrefix ? oldLen : 0;

  return resultVNodes;
}
