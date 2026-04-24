/**
 * For primitive runtime
 *
 * Manages per-item component instances and array reconciliation
 * to eliminate over-invalidation in list rendering.
 */

import { type State } from './state';
import { type ComponentInstance, getCurrentInstance } from './component';
import { type DOMElement, type VNode } from '../common/vnode';
import { ELEMENT_TYPE, type JSXElement } from '../common/jsx';
import type { Props } from '../common/props';
import { isDevelopmentEnvironment } from '../common/env';
import { logger } from '../dev/logger';
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
  withBenchMetricScope,
};

export interface ForItemInstance<T> {
  key: string | number | null;
  item: T;
  indexSignal: ForIndexSignal;
  scope: ChildScope;
}

type ForIndexSignal = (() => number) & {
  set(newValue: number | ((prev: number) => number)): void;
};

export type ForCommitStrategy =
  | 'APPEND'
  | 'TRUNCATE'
  | 'NO_REORDER'
  | 'SWAP'
  | 'FULL_KEYED';

export interface ForState<T> {
  sourceState: State<T[]> | null;
  items: Map<string | number | null, ForItemInstance<T>>;
  orderedKeys: Array<string | number | null>;
  orderedVNodes: VNode[];
  byFn: (item: T, index: number) => string | number | null;
  renderFn: (item: T, index: () => number) => VNode;
  parentInstance: ComponentInstance | null;
  mounted: boolean;
  lastCommitStrategy: ForCommitStrategy;
  lastRemovedNodes: Node[];
  pendingDirtyIndices: number[] | null;
  pendingSwapIndices: [number, number] | null;
  devWarningsEmitted?: Set<string>;
}

/**
 * Evaluate JSXElement to VNode
 *
 * When a For render function returns a JSXElement (from JSX syntax like <Row .../>),
 * we need to evaluate it by calling the component function to get the actual vnode.
 * This handles the common case of returning a component from For's render function.
 */
function evaluateJSXElement(value: unknown): VNode {
  if (value && typeof value === 'object' && 'type' in value) {
    const jsxEl = value as JSXElement & { props?: Props };

    if ('$$typeof' in jsxEl && jsxEl.$$typeof !== ELEMENT_TYPE) {
      return value as VNode;
    }

    // If the type is a function (component), call it to get the vnode
    if (typeof jsxEl.type === 'function') {
      const componentFn = jsxEl.type as (props: Props) => unknown;
      const result = componentFn(jsxEl.props || {});
      // Recursively evaluate in case the component returns another JSXElement
      return evaluateJSXElement(result);
    }

    // For intrinsic elements (string type) or symbols, return as-is
    // The renderer will handle these
    return jsxEl as VNode;
  }

  // Not a JSXElement, return as-is
  return value as VNode;
}

export function createForState<T>(
  source: State<T[]> | (() => T[]),
  byFn: (item: T, index: number) => string | number,
  renderFn: (item: T, index: () => number) => VNode
): ForState<T> {
  const sourceState = typeof source === 'function' ? null : source;
  const parentInstance = getCurrentInstance();

  return {
    sourceState,
    items: new Map(),
    orderedKeys: [],
    orderedVNodes: [],
    byFn: byFn,
    renderFn,
    parentInstance,
    mounted: false,
    lastCommitStrategy: 'NO_REORDER',
    lastRemovedNodes: [],
    pendingDirtyIndices: null,
    pendingSwapIndices: null,
  };
}

function createForIndexSignal(initialIndex: number): ForIndexSignal {
  let indexValue = initialIndex;

  const indexSignal = (() => indexValue) as ForIndexSignal;
  indexSignal.set = (newValue: number | ((prev: number) => number)) => {
    const nextValue =
      typeof newValue === 'function' ? newValue(indexValue) : newValue;
    if (nextValue !== indexValue) {
      indexValue = nextValue;
    }
  };

  return indexSignal;
}

function materializeItemVnode(
  key: string | number | null,
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
  key: string | number | null
): VNode {
  recordBenchEvent('rowFactory');
  const vnode = scope.render(() =>
    evaluateJSXElement(forState.renderFn(item, indexSignal))
  );
  materializeItemVnode(key, vnode);
  return vnode;
}

function warnForStateOnce(
  forState: ForState<unknown>,
  key: string,
  message: string
): void {
  if (!isDevelopmentEnvironment()) {
    return;
  }

  const warnings = (forState.devWarningsEmitted ??= new Set());
  if (warnings.has(key)) {
    return;
  }

  warnings.add(key);
  logger.warn(message);
}

function validateForKeys<T>(forState: ForState<T>, newArray: T[]): void {
  if (!isDevelopmentEnvironment()) {
    return;
  }

  const seen = new Set<string | number | null>();
  for (let i = 0; i < newArray.length; i++) {
    const key = forState.byFn(newArray[i], i);

    if (key === null || key === undefined) {
      warnForStateOnce(
        forState as ForState<unknown>,
        'invalid-key:null',
        '[askr] Invalid For key detected. Keys should be stable, non-null, and unique within a For list.'
      );
      continue;
    }

    if (seen.has(key)) {
      warnForStateOnce(
        forState as ForState<unknown>,
        `duplicate-key:${String(key)}`,
        `[askr] Duplicate For key detected: ${String(key)}. Keys should be stable, non-null, and unique within a For list.`
      );
      continue;
    }

    seen.add(key);
  }
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
  key: string | number | null,
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

export function reconcileForItems<T>(
  forState: ForState<T>,
  newArray: T[]
): VNode[] {
  validateForKeys(forState, newArray);

  if (BENCH_BUILD_ENABLED) {
    resetBenchMetrics();
  }

  const reconcileStartMs = BENCH_BUILD_ENABLED ? performance.now() : 0;

  const { items, orderedKeys, byFn } = forState;
  const oldLen = orderedKeys.length;
  const newLen = newArray.length;
  forState.lastRemovedNodes = [];

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

            if (itemChanged) {
              existing.item = item;
              rerenderItemInstance(forState, existing, item);
            }

            if (
              itemChanged ||
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

      if (firstExisting.indexSignal() !== firstMismatch) {
        firstExisting.indexSignal.set(firstMismatch);
      }

      if (secondExisting.indexSignal() !== secondMismatch) {
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
  const newOrderedKeys: Array<string | number | null> = [];
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
      const indexChanged = existing.indexSignal() !== i;

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

export function evaluateForState<T>(
  forState: ForState<T>,
  source: State<T[]> | (() => T[])
): VNode[] {
  const currentArray =
    typeof source === 'function' ? source() : (source as State<T[]>)();

  if (!Array.isArray(currentArray)) {
    throw new Error('For source must evaluate to an array');
  }

  return reconcileForItems(forState, currentArray);
}

export function clearForDomUpdateState<T>(forState: ForState<T>): void {
  for (let i = 0; i < forState.orderedKeys.length; i++) {
    const key = forState.orderedKeys[i];
    const itemInstance = forState.items.get(key);
    if (itemInstance) {
      itemInstance.scope.needsDomUpdate = false;
    }
  }
  forState.lastRemovedNodes = [];
  forState.pendingDirtyIndices = null;
  forState.pendingSwapIndices = null;
}
