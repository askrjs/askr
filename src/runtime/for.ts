/**
 * For primitive runtime
 *
 * Manages per-item component instances and array reconciliation
 * to eliminate over-invalidation in list rendering.
 */

import { type ComponentInstance, getCurrentInstance } from './component';
import { type DOMElement, type VNode } from '../common/vnode';
import { isDevelopmentEnvironment } from '../common/env';
import {
  teardownNodeSubtree,
  removeElementReactiveProps,
  removeElementListeners,
} from '../renderer/cleanup';
import {
  createChildScope,
  disposeChildScope,
  type ChildScope,
} from './child-scope';
import type { ForProps } from '../control/for';
import {
  markReactivePropsDirtySource,
  markReadableDerivedSubscribersDirty,
  notifyReadableReaders,
  recordReadableRead,
  type ReadableSource,
} from './readable';
import {
  flushBenchMetrics,
  getBenchMetrics,
  isBenchBuildEnabled,
  isBenchMetricScopeActive,
  recordBenchEvent,
  recordBenchCounter,
  recordBenchFastLane,
  recordBenchTiming,
  resetBenchMetrics,
  withBenchMetricScope,
} from './for-bench';

const BENCH_BUILD_ENABLED = isBenchBuildEnabled();

export {
  getBenchMetrics,
  isBenchMetricScopeActive,
  recordBenchCounter,
  recordBenchEvent,
  recordBenchTiming,
  resetBenchMetrics,
  withBenchMetricScope,
};

export interface ForItemInstance<T> {
  key: string | number;
  item: T;
  indexSignal: ForIndexSignal;
  scope: ChildScope;
}

type ForIndexSignal = ReadableSource<number> &
  (() => number) & {
    peek(): number;
    set(newValue: number | ((prev: number) => number)): void;
  };

export type ForCommitStrategy =
  | 'APPEND'
  | 'TRUNCATE'
  | 'NO_REORDER'
  | 'SWAP'
  | 'FULL_KEYED';

export interface ForState<T> {
  kind: 'for';
  currentItems: T[];
  fallback: VNode | null;
  fallbackScope: ChildScope | null;
  items: Map<string | number, ForItemInstance<T>>;
  orderedKeys: Array<string | number>;
  orderedVNodes: VNode[];
  byFn: NonNullable<ForProps<T>['by']> | ((item: T, index: number) => number);
  renderFn: (item: T, index: () => number) => VNode;
  parentInstance: ComponentInstance | null;
  lastCommitStrategy: ForCommitStrategy;
  lastRemovedNodes: Node[];
  pendingDirtyIndices: number[] | null;
  pendingSwapIndices: [number, number] | null;
  devKeyKinds?: Map<string, 'number' | 'string'>;
}

export function createForState<T>(
  items: T[],
  byFn: ForState<T>['byFn'],
  renderFn: (item: T, index: () => number) => VNode,
  fallback: VNode | null
): ForState<T> {
  const parentInstance = getCurrentInstance();

  return {
    kind: 'for',
    currentItems: items,
    fallback,
    fallbackScope: null,
    items: new Map(),
    orderedKeys: [],
    orderedVNodes: [],
    byFn,
    renderFn,
    parentInstance,
    lastCommitStrategy: 'NO_REORDER',
    lastRemovedNodes: [],
    pendingDirtyIndices: null,
    pendingSwapIndices: null,
  };
}

function createForIndexSignal(initialIndex: number): ForIndexSignal {
  let indexValue = initialIndex;
  const readers = new Map<ComponentInstance, number>();

  const indexSignal = (() => {
    indexSignal._hasBeenRead = true;
    recordReadableRead(indexSignal);
    return indexValue;
  }) as ForIndexSignal;
  indexSignal._readers = readers;
  indexSignal.peek = () => indexValue;
  indexSignal.set = (newValue: number | ((prev: number) => number)) => {
    const nextValue =
      typeof newValue === 'function' ? newValue(indexValue) : newValue;
    if (nextValue !== indexValue) {
      indexValue = nextValue;
      markReadableDerivedSubscribersDirty(indexSignal);
      markReactivePropsDirtySource(indexSignal);
      notifyReadableReaders(indexSignal);
    }
  };
  indexSignal._hasBeenRead = false;

  return indexSignal;
}

function materializeItemVnode(
  key: string | number,
  vnode: VNode | undefined
): void {
  if (vnode && typeof vnode === 'object' && 'type' in vnode) {
    const vn = vnode as DOMElement;
    vn.key = key;

    if (typeof vn.type === 'string') {
      if (!vn.props) vn.props = {};
      if (vn.props['data-key'] === undefined) {
        vn.props['data-key'] = String(key);
      }
    }
  }
}

function renderItemScope<T>(
  forState: ForState<T>,
  scope: ChildScope,
  item: T,
  indexSignal: ForIndexSignal,
  key: string | number
): VNode {
  recordBenchEvent('rowFactory');
  const vnode = scope.render(() => forState.renderFn(item, indexSignal));
  materializeItemVnode(key, vnode);
  return vnode;
}

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

type RemovedDomCleanupMode = 'none' | 'teardown' | 'full-clear';

function disposeItemInstance<T>(
  forState: ForState<T>,
  itemInstance: ForItemInstance<T>,
  domCleanup: RemovedDomCleanupMode
): void {
  recordBenchEvent('itemRemoved');
  const removedDom = itemInstance.scope.dom;

  try {
    disposeChildScope(itemInstance.scope);
  } catch (err) {
    if (isDevelopmentEnvironment()) {
      console.error('[For] Cleanup error:', err);
    }
  }

  if (!removedDom) {
    return;
  }

  if (removedDom instanceof Element) {
    if (domCleanup === 'full-clear') {
      removeElementReactiveProps(removedDom);
      removeElementListeners(removedDom);
    } else if (domCleanup === 'teardown') {
      teardownNodeSubtree(removedDom);
    }
  }

  forState.lastRemovedNodes.push(removedDom);
}

export function createItemInstance<T>(
  key: string | number,
  item: T,
  index: number,
  forState: ForState<T>
): ForItemInstance<T> {
  recordBenchEvent('itemCreated');

  // Create index signal manually without going through state() hook
  // to avoid hook order violations (each For item creates its signal dynamically)
  const indexSignal = createForIndexSignal(index);
  const scope = createChildScope(forState.parentInstance, key, () => {
    const parent = forState.parentInstance;
    if (parent) {
      parent._enqueueRun?.();
    }
  });

  renderItemScope(forState, scope, item, indexSignal, key);

  const itemInstance: ForItemInstance<T> = {
    key,
    item,
    indexSignal,
    scope,
  };

  return itemInstance;
}

function rerenderItemInstance<T>(
  forState: ForState<T>,
  itemInstance: ForItemInstance<T>,
  item: T
): void {
  renderItemScope(
    forState,
    itemInstance.scope,
    item,
    itemInstance.indexSignal,
    itemInstance.key
  );
}

const FOR_FALLBACK_SCOPE_KEY = '__for-fallback__';

function disposeFallbackScope<T>(
  forState: ForState<T>,
  domCleanup: RemovedDomCleanupMode
): void {
  const fallbackScope = forState.fallbackScope;
  if (!fallbackScope) {
    return;
  }

  const removedDom = fallbackScope.dom;
  disposeChildScope(fallbackScope);
  forState.fallbackScope = null;

  if (!removedDom) {
    return;
  }

  if (removedDom instanceof Element) {
    if (domCleanup === 'full-clear') {
      removeElementReactiveProps(removedDom);
      removeElementListeners(removedDom);
    } else if (domCleanup === 'teardown') {
      teardownNodeSubtree(removedDom);
    }
  }

  forState.lastRemovedNodes.push(removedDom);
}

function renderFallbackScope<T>(forState: ForState<T>): VNode[] {
  if (forState.fallback == null || forState.fallback === false) {
    if (forState.fallbackScope) {
      disposeFallbackScope(forState, 'none');
    }
    forState.orderedVNodes = [];
    return [];
  }

  const fallbackScope =
    forState.fallbackScope ??
    createChildScope(forState.parentInstance, FOR_FALLBACK_SCOPE_KEY, () => {
      forState.parentInstance?._enqueueRun?.();
    });
  forState.fallbackScope = fallbackScope;

  const vnode = fallbackScope.render(() => forState.fallback as VNode);
  forState.orderedVNodes = vnode == null || vnode === false ? [] : [vnode];
  return forState.orderedVNodes;
}

function disposeAllItems<T>(
  forState: ForState<T>,
  domCleanup: RemovedDomCleanupMode
): void {
  const { items, orderedKeys } = forState;
  for (let index = 0; index < orderedKeys.length; index += 1) {
    const key = orderedKeys[index];
    const itemInstance = items.get(key);
    if (!itemInstance) {
      continue;
    }
    disposeItemInstance(forState, itemInstance, domCleanup);
    items.delete(key);
  }
  orderedKeys.length = 0;
  forState.orderedKeys = orderedKeys;
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
      disposeAllItems(forState, forState.fallback ? 'teardown' : 'full-clear');
    }
    recordBenchFastLane('TRUNCATE');
    forState.lastCommitStrategy = 'TRUNCATE';
    forState.pendingDirtyIndices = null;
    forState.pendingSwapIndices = null;

    if (BENCH_BUILD_ENABLED) {
      recordBenchTiming('reconcile', performance.now() - reconcileStartMs);
      flushBenchMetrics();
    }

    return renderFallbackScope(forState);
  }

  if (forState.fallbackScope) {
    disposeFallbackScope(forState, 'none');
  }

  // ─────────────────────────────────────────────────────────────────────────
  // FAST PATH A: APPEND
  // Guard: oldLen <= newLen && all old keys match new keys at same indices
  // ─────────────────────────────────────────────────────────────────────────
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
      resultVNodes.length = newLen;

      // Update existing rows in-place
      for (let i = 0; i < oldLen; i++) {
        const item = newArray[i];
        const key = orderedKeys[i];
        const existing = items.get(key)!;
        recordBenchEvent('itemReused');

        const itemChanged = existing.item !== item;
        if (itemChanged) {
          existing.item = item;
          rerenderItemInstance(forState, existing, item);
        }

        resultVNodes[i] = existing.scope.vnode as VNode;
      }

      // Create and append new rows
      for (let i = oldLen; i < newLen; i++) {
        const item = newArray[i];
        const key = byFn(item, i);
        const itemInstance = createItemInstance(key, item, i, forState);
        items.set(key, itemInstance);
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

      return resultVNodes;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // FAST PATH B: TRUNCATE
  // Guard: newLen <= oldLen && all new keys match old keys at same indices
  // ─────────────────────────────────────────────────────────────────────────
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

          const resultVNodes = forState.orderedVNodes;
          resultVNodes.length = newLen;
          const dirtyIndices: number[] = [];

          for (let i = 0; i < newLen; i++) {
            const item = newArray[i];
            const key = i < removedIndex ? orderedKeys[i] : orderedKeys[i + 1];
            const existing = items.get(key)!;
            recordBenchEvent('itemReused');

            const itemChanged = existing.item !== item;
            const needsDomUpdate = existing.scope.needsDomUpdate;
            const indexChanged = existing.indexSignal.peek() !== i;

            if (itemChanged) {
              existing.item = item;
              rerenderItemInstance(forState, existing, item);
            }

            if (indexChanged) {
              existing.indexSignal.set(i);
            }

            if (
              itemChanged ||
              indexChanged ||
              needsDomUpdate ||
              existing.scope.needsDomUpdate
            ) {
              dirtyIndices.push(i);
            }

            resultVNodes[i] = existing.scope.vnode as VNode;
          }

          const removedKey = orderedKeys[removedIndex];
          const removedItem = items.get(removedKey);
          if (removedItem) {
            disposeItemInstance(forState, removedItem, 'teardown');
            items.delete(removedKey);
          }

          const nextOrderedKeys = orderedKeys.slice(0, newLen);
          for (let i = removedIndex; i < newLen; i++) {
            nextOrderedKeys[i] = orderedKeys[i + 1];
          }
          forState.orderedKeys = nextOrderedKeys;

          if (BENCH_BUILD_ENABLED) {
            recordBenchTiming(
              'reconcile',
              performance.now() - reconcileStartMs
            );
            flushBenchMetrics();
          }

          forState.pendingDirtyIndices = dirtyIndices;
          forState.pendingSwapIndices = null;

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
      resultVNodes.length = newLen;
      const isFullClear = newLen === 0;

      // Update existing rows in-place
      for (let i = 0; i < newLen; i++) {
        const item = newArray[i];
        const key = orderedKeys[i];
        const existing = items.get(key)!;
        recordBenchEvent('itemReused');

        const itemChanged = existing.item !== item;
        if (itemChanged) {
          existing.item = item;
          rerenderItemInstance(forState, existing, item);
        }

        resultVNodes[i] = existing.scope.vnode as VNode;
      }

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

      if (BENCH_BUILD_ENABLED) {
        recordBenchTiming('reconcile', performance.now() - reconcileStartMs);
        flushBenchMetrics();
      }

      forState.orderedVNodes = resultVNodes;
      forState.pendingDirtyIndices = null;
      forState.pendingSwapIndices = null;

      return resultVNodes;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // FAST PATH C: NO-REORDER (in-place update only)
  // Guard: oldLen === newLen && keys match at all indices
  // ─────────────────────────────────────────────────────────────────────────
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
      resultVNodes.length = oldLen;
      const dirtyIndices: number[] = [];

      // Update in-place only, no DOM moves needed
      for (let i = 0; i < oldLen; i++) {
        const item = newArray[i];
        const key = orderedKeys[i];
        const existing = items.get(key)!;
        recordBenchEvent('itemReused');

        const itemChanged = existing.item !== item;
        const needsDomUpdate = existing.scope.needsDomUpdate;

        if (itemChanged) {
          existing.item = item;
          rerenderItemInstance(forState, existing, item);
        }

        if (itemChanged || needsDomUpdate || existing.scope.needsDomUpdate) {
          dirtyIndices.push(i);
        }

        resultVNodes[i] = existing.scope.vnode as VNode;
      }

      if (BENCH_BUILD_ENABLED) {
        recordBenchTiming('reconcile', performance.now() - reconcileStartMs);
        flushBenchMetrics();
      }

      forState.pendingDirtyIndices = dirtyIndices;
      forState.pendingSwapIndices = null;

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

      recordBenchEvent('itemReused');
      recordBenchEvent('itemReused');

      if (firstExisting.item !== firstItem) {
        firstExisting.item = firstItem;
        rerenderItemInstance(forState, firstExisting, firstItem);
      }

      if (secondExisting.item !== secondItem) {
        secondExisting.item = secondItem;
        rerenderItemInstance(forState, secondExisting, secondItem);
      }

      if (firstExisting.indexSignal.peek() !== firstMismatch) {
        firstExisting.indexSignal.set(firstMismatch);
      }

      if (secondExisting.indexSignal.peek() !== secondMismatch) {
        secondExisting.indexSignal.set(secondMismatch);
      }

      resultVNodes[firstMismatch] = firstExisting.scope.vnode as VNode;
      resultVNodes[secondMismatch] = secondExisting.scope.vnode as VNode;

      forState.orderedKeys = nextOrderedKeys;

      if (BENCH_BUILD_ENABLED) {
        recordBenchTiming('reconcile', performance.now() - reconcileStartMs);
        flushBenchMetrics();
      }

      forState.pendingDirtyIndices = null;
      forState.pendingSwapIndices = [firstMismatch, secondMismatch];

      return resultVNodes;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // FULL KEYED RECONCILIATION (slow path for complex reorders)
  // Avoid allocating newKeyMap: iterate directly and track removals
  // ─────────────────────────────────────────────────────────────────────────
  recordBenchFastLane('FULL_KEYED');
  forState.lastCommitStrategy = 'FULL_KEYED';

  const toRemove = new Set(orderedKeys);
  const newOrderedKeys: Array<string | number> = [];
  const resultVNodes: VNode[] = [];

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
      resultVNodes.push(itemInstance.scope.vnode as VNode);
    } else {
      // Exists: check if item changed (by identity)
      recordBenchEvent('itemReused');
      const itemChanged = existing.item !== item;
      const indexChanged = existing.indexSignal.peek() !== i;

      if (itemChanged) {
        // Item data changed: update and re-execute
        existing.item = item;
        rerenderItemInstance(forState, existing, item);
      }

      if (indexChanged) {
        // Index changed: update index signal (triggers re-render if index is used)
        existing.indexSignal.set(i);
      }

      resultVNodes.push(existing.scope.vnode as VNode);
    }
  }

  // Remove deleted items
  for (const key of toRemove) {
    const itemInstance = items.get(key);
    if (itemInstance) {
      disposeItemInstance(forState, itemInstance, 'none');
      items.delete(key);
    }
  }

  forState.orderedKeys = newOrderedKeys;

  // Record reconcile timing
  if (BENCH_BUILD_ENABLED) {
    recordBenchTiming('reconcile', performance.now() - reconcileStartMs);
    flushBenchMetrics();
  }

  forState.orderedVNodes = resultVNodes;
  forState.pendingDirtyIndices = null;
  forState.pendingSwapIndices = null;

  return resultVNodes;
}

export function evaluateForState<T>(forState: ForState<T>): VNode[] {
  if (!Array.isArray(forState.currentItems)) {
    throw new Error('For source must evaluate to an array');
  }

  return reconcileForItems(forState, forState.currentItems);
}

export function clearForDomUpdateState<T>(forState: ForState<T>): void {
  for (let i = 0; i < forState.orderedKeys.length; i++) {
    const key = forState.orderedKeys[i];
    const itemInstance = forState.items.get(key);
    if (itemInstance) {
      itemInstance.scope.needsDomUpdate = false;
    }
  }
  if (forState.fallbackScope) {
    forState.fallbackScope.needsDomUpdate = false;
  }
  forState.lastRemovedNodes = [];
  forState.pendingDirtyIndices = null;
  forState.pendingSwapIndices = null;
}
