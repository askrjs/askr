/**
 * For primitive runtime
 *
 * Manages per-item component instances and array reconciliation
 * to eliminate over-invalidation in list rendering.
 */

import { type State } from './state';
import {
  type ComponentInstance,
  createComponentInstance,
  getCurrentInstance,
  setCurrentComponentInstance,
  finalizeReadSubscriptions,
  getCurrentStateIndex,
  setStateIndex,
  cleanupComponent,
} from './component';
import type { DOMElement, VNode } from '../common/vnode';
import type { ComponentFunction } from '../common/component';
import { ELEMENT_TYPE, type JSXElement } from '../common/jsx';
import type { Props } from '../common/props';
import {
  teardownNodeSubtree,
  removeElementReactiveProps,
  removeElementListeners,
} from '../renderer/cleanup';
import {
  flushBenchMetrics,
  getBenchMetrics,
  isBenchBuildEnabled,
  recordBenchEvent,
  recordBenchFastLane,
  recordBenchTiming,
  resetBenchMetrics,
} from './for-bench';

const BENCH_BUILD_ENABLED = isBenchBuildEnabled();

export { getBenchMetrics };
export { recordBenchEvent, recordBenchTiming };

export interface ForItemInstance<T> {
  key: string | number | null;
  item: T;
  indexSignal: State<number>;
  componentInstance: ComponentInstance;
  vnode: VNode | undefined;
  _startStateIndex: number; // Global state index when item was created
  _dom?: Node; // Cached DOM node for efficient updates
  _needsDomUpdate: boolean;
}

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
}

/**
 * Evaluate JSXElement to VNode
 *
 * When a For render function returns a JSXElement (from JSX syntax like <Row .../>),
 * we need to evaluate it by calling the component function to get the actual vnode.
 * This handles the common case of returning a component from For's render function.
 */
function evaluateJSXElement(value: unknown): VNode {
  // Check if this is a JSXElement (has $$typeof marker)
  if (
    value &&
    typeof value === 'object' &&
    '$$typeof' in value &&
    (value as JSXElement).$$typeof === ELEMENT_TYPE
  ) {
    const jsxEl = value as JSXElement;

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

let _forRenderCounter = 1;

export function createItemInstance<T>(
  key: string | number | null,
  item: T,
  index: number,
  forState: ForState<T>
): ForItemInstance<T> {
  recordBenchEvent('itemCreated');

  // Create index signal manually without going through state() hook
  // to avoid hook order violations (each For item creates its signal dynamically)
  let indexValue = index;
  // Cast to avoid strict structural check during dts build — we'll add iterator below
  const indexSignal: State<number> = Object.assign(() => indexValue, {
    set(newValue: number | ((prev: number) => number)) {
      const nextValue =
        typeof newValue === 'function' ? newValue(indexValue) : newValue;
      if (nextValue !== indexValue) {
        indexValue = nextValue;
        // Index changes typically don't need to trigger re-renders
        // but we provide the signal for user convenience
      }
    },
  }) as unknown as State<number>;

  // Provide iterable interface so callers can destructure: const [i, setI] = indexSignal
  (
    indexSignal as unknown as {
      [Symbol.iterator]?: () => Iterator<
        State<number> | typeof indexSignal.set
      >;
    }
  )[Symbol.iterator] = function* (): Generator<
    State<number> | typeof indexSignal.set,
    void,
    unknown
  > {
    yield indexSignal;
    yield indexSignal.set;
  };

  // Create isolated component for this item. The renderFn is executed while
  // this instance is the current component so nested state() calls register
  // readers against this instance for precise notification.
  const noopComponentFn: ComponentFunction = () => null;
  const itemComponent = createComponentInstance(
    `for-item-${key}`,
    noopComponentFn,
    {},
    null
  );

  // Inherit parent context
  if (forState.parentInstance) {
    itemComponent.ownerFrame = forState.parentInstance.ownerFrame;
  }

  // Execute initial render function while treating this instance as the
  // current component so `state()` calls register correctly.
  const savedInst = getCurrentInstance();
  setCurrentComponentInstance(itemComponent);

  // Capture the current global state index so we can restore it on re-renders
  const startStateIndex = getCurrentStateIndex();

  // Prepare render token and pending reads so finalizeReadSubscriptions works
  // (this mirrors behavior in runComponent).
  itemComponent._currentRenderToken = _forRenderCounter++;
  itemComponent._pendingReadSources = undefined;

  recordBenchEvent('rowFactory');
  const vnode = evaluateJSXElement(
    forState.renderFn(item, () => indexSignal())
  );

  // Materialize key on vnode so renderer key extraction works
  if (vnode && typeof vnode === 'object' && 'type' in vnode) {
    const vn = vnode as DOMElement;
    vn.key = key;

    // Automatically add data-key to intrinsic elements (tr, li, etc)
    // so we don't need to manually add it in the render function.
    if (typeof vn.type === 'string') {
      if (!vn.props) vn.props = {};
      if (vn.props['data-key'] === undefined) {
        vn.props['data-key'] = String(key);
      }
    }
  }

  // Commit initial subscriptions so nested state changes will notify this
  // instance's pending task appropriately.
  finalizeReadSubscriptions(itemComponent);

  // Restore previous current instance
  setCurrentComponentInstance(savedInst);

  // Create the item instance to capture in closure (avoids redundant Map lookup)
  const itemInstance: ForItemInstance<T> = {
    key,
    item,
    indexSignal,
    componentInstance: itemComponent,
    vnode,
    _startStateIndex: startStateIndex,
    _needsDomUpdate: true,
  };

  // Override the pending flush task for this item so that when nested state
  // changes we recompute this item's vnode and request the parent to re-render.
  // Perf: capture itemInstance directly to avoid Map.get() during flush
  itemComponent._pendingFlushTask = () => {
    const saved = getCurrentInstance();
    setCurrentComponentInstance(itemComponent);

    // Reset state index tracking for this re-render (same as executeComponentSync)
    itemComponent.stateIndexCheck = -1;

    // Reset read tracking: iterate only if states exist (O(states) not O(items))
    const stateValues = itemComponent.stateValues;
    for (let i = 0; i < stateValues.length; i++) {
      const state = stateValues[i];
      if (state) {
        state._hasBeenRead = false;
      }
    }

    // Restore the global state index to where it was when this item was created
    // This ensures state() calls use the same indices as during initial render
    setStateIndex(startStateIndex);

    itemComponent._currentRenderToken = _forRenderCounter++;
    itemComponent._pendingReadSources = undefined;

    // Safely re-render into vnode slot for this item
    try {
      const newVnode = evaluateJSXElement(
        forState.renderFn(item, () => indexSignal())
      );
      // Update the stored vnode directly in captured instance
      itemInstance.vnode = newVnode;
      itemInstance._needsDomUpdate = true;
      // Commit read subscriptions for this re-render
      finalizeReadSubscriptions(itemComponent);
    } finally {
      setCurrentComponentInstance(saved);
    }

    // Ask parent For boundary to re-render so DOM updates are applied
    const parent = forState.parentInstance;
    if (parent) parent._enqueueRun?.();
  };

  return itemInstance;
}

function rerenderItemInstance<T>(
  forState: ForState<T>,
  itemInstance: ForItemInstance<T>,
  item: T
): void {
  const component = itemInstance.componentInstance;
  const savedInstance = getCurrentInstance();
  const savedStateIndex = getCurrentStateIndex();

  setCurrentComponentInstance(component);
  component.stateIndexCheck = -1;

  const stateValues = component.stateValues;
  for (let i = 0; i < stateValues.length; i++) {
    const state = stateValues[i];
    if (state) {
      state._hasBeenRead = false;
    }
  }

  setStateIndex(itemInstance._startStateIndex);
  component._currentRenderToken = _forRenderCounter++;
  component._pendingReadSources = undefined;

  try {
    recordBenchEvent('rowFactory');
    itemInstance.vnode = evaluateJSXElement(
      forState.renderFn(item, () => itemInstance.indexSignal())
    );
    itemInstance._needsDomUpdate = true;
    try {
      if (
        itemInstance.vnode &&
        typeof itemInstance.vnode === 'object' &&
        'type' in itemInstance.vnode
      ) {
        (itemInstance.vnode as { key?: string | number | null }).key =
          itemInstance.key;
      }
    } catch (e) {
      void e;
    }
    finalizeReadSubscriptions(component);
  } finally {
    setStateIndex(savedStateIndex);
    setCurrentComponentInstance(savedInstance);
  }
}

export function reconcileForItems<T>(
  forState: ForState<T>,
  newArray: T[]
): VNode[] {
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
      const resultVNodes: VNode[] = [];

      // Update existing rows in-place
      for (let i = 0; i < oldLen; i++) {
        const item = newArray[i];
        const key = orderedKeys[i];
        const existing = items.get(key)!;
        recordBenchEvent('itemReused');

        const itemChanged = existing.item !== item;
        const indexChanged = existing.indexSignal() !== i;

        if (itemChanged) {
          existing.item = item;
          rerenderItemInstance(forState, existing, item);
        }

        if (indexChanged) {
          existing.indexSignal.set(i);
        }

        resultVNodes.push(existing.vnode);
      }

      // Create and append new rows
      for (let i = oldLen; i < newLen; i++) {
        const item = newArray[i];
        const key = byFn(item, i);
        const itemInstance = createItemInstance(key, item, i, forState);
        items.set(key, itemInstance);
        resultVNodes.push(itemInstance.vnode);
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
            const needsDomUpdate = existing._needsDomUpdate;

            if (itemChanged) {
              existing.item = item;
              rerenderItemInstance(forState, existing, item);
            }

            if (itemChanged || needsDomUpdate || existing._needsDomUpdate) {
              dirtyIndices.push(i);
            }

            resultVNodes[i] = existing.vnode;
          }

          const removedKey = orderedKeys[removedIndex];
          const removedItem = items.get(removedKey);
          if (removedItem) {
            recordBenchEvent('itemRemoved');
            const instance = removedItem.componentInstance;
            try {
              cleanupComponent(instance);
            } catch (err) {
              if (process.env.NODE_ENV !== 'production') {
                console.error('[For] Cleanup error:', err);
              }
            }

            if (removedItem._dom) {
              if (removedItem._dom instanceof Element) {
                teardownNodeSubtree(removedItem._dom);
              }
              forState.lastRemovedNodes.push(removedItem._dom);
            }

            removedItem.vnode = undefined;
            removedItem._dom = undefined;
            items.delete(removedKey);
          }

          const nextOrderedKeys = orderedKeys.slice(0, newLen);
          for (let i = removedIndex; i < newLen; i++) {
            nextOrderedKeys[i] = orderedKeys[i + 1];
          }
          forState.orderedKeys = nextOrderedKeys;

          if (BENCH_BUILD_ENABLED) {
            recordBenchTiming('reconcile', performance.now() - reconcileStartMs);
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
      const resultVNodes: VNode[] = [];
      const isFullClear = newLen === 0;

      // Update existing rows in-place
      for (let i = 0; i < newLen; i++) {
        const item = newArray[i];
        const key = orderedKeys[i];
        const existing = items.get(key)!;
        recordBenchEvent('itemReused');

        const itemChanged = existing.item !== item;
        const indexChanged = existing.indexSignal() !== i;

        if (itemChanged) {
          existing.item = item;
          rerenderItemInstance(forState, existing, item);
        }

        if (indexChanged) {
          existing.indexSignal.set(i);
        }

        resultVNodes.push(existing.vnode);
      }

      // Remove tail rows
      for (let i = newLen; i < oldLen; i++) {
        const key = orderedKeys[i];
        const itemInstance = items.get(key);
        if (itemInstance) {
          recordBenchEvent('itemRemoved');
          const instance = itemInstance.componentInstance;
          try {
            cleanupComponent(instance);
          } catch (err) {
            if (process.env.NODE_ENV !== 'production') {
              console.error('[For] Cleanup error:', err);
            }
          }
          // Clean up cached DOM node if present
          if (itemInstance._dom) {
            if (itemInstance._dom instanceof Element) {
              if (isFullClear) {
                removeElementReactiveProps(itemInstance._dom);
                removeElementListeners(itemInstance._dom);
              } else {
                teardownNodeSubtree(itemInstance._dom);
              }
            }
            forState.lastRemovedNodes.push(itemInstance._dom);
          }
          itemInstance.vnode = undefined;
          itemInstance._dom = undefined;
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
        const needsDomUpdate = existing._needsDomUpdate;

        if (itemChanged) {
          existing.item = item;
          rerenderItemInstance(forState, existing, item);
        }

        if (itemChanged || needsDomUpdate || existing._needsDomUpdate) {
          dirtyIndices.push(i);
        }

        resultVNodes[i] = existing.vnode;
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

      resultVNodes[firstMismatch] = firstExisting.vnode;
      resultVNodes[secondMismatch] = secondExisting.vnode;

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
      resultVNodes.push(itemInstance.vnode);
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

      resultVNodes.push(existing.vnode);
    }
  }

  // Remove deleted items
  for (const key of toRemove) {
    const itemInstance = items.get(key);
    if (itemInstance) {
      recordBenchEvent('itemRemoved');
      // Clean up component instance
      const instance = itemInstance.componentInstance;
      try {
        cleanupComponent(instance);
      } catch (err) {
        if (process.env.NODE_ENV !== 'production') {
          console.error('[For] Cleanup error:', err);
        }
      }

      // Clean up cached DOM node if present
      if (itemInstance._dom) {
        if (itemInstance._dom instanceof Element) {
          teardownNodeSubtree(itemInstance._dom);
        }
        forState.lastRemovedNodes.push(itemInstance._dom);
      }

      itemInstance.vnode = undefined;
      itemInstance._dom = undefined;

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
      itemInstance._needsDomUpdate = false;
    }
  }
  forState.lastRemovedNodes = [];
  forState.pendingDirtyIndices = null;
  forState.pendingSwapIndices = null;
}
