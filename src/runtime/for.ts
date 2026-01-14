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
} from './component';
import type { VNode } from '../common/vnode';
import type { ComponentFunction } from '../common/component';

const askrGlobal = globalThis as typeof globalThis & {
  __ASKR_CURRENT_INSTANCE__?: unknown;
};

export interface ForItemInstance<T> {
  key: string | number;
  item: T;
  indexSignal: State<number>;
  componentInstance: ComponentInstance;
  vnode: VNode | undefined;
  _startStateIndex: number; // Global state index when item was created
  _dom?: Node; // Cached DOM node for efficient updates
}

export interface ForState<T> {
  sourceState: State<T[]> | null;
  items: Map<string | number | null, ForItemInstance<T>>;
  orderedKeys: Array<string | number | null>;
  byFn: (item: T, index: number) => string | number | null;
  renderFn: (item: T, index: () => number) => VNode;
  parentInstance: ComponentInstance | null;
  mounted: boolean;
}

const defaultKeyFn = <T>(item: T, index: number): string | number | null => {
  if (item != null && typeof item === 'object' && 'id' in item) {
    return (item as { id: string | number | null }).id;
  }
  return index;
};

export function createForState<T>(
  source: State<T[]> | (() => T[]),
  renderFn: (item: T, index: () => number) => VNode,
  byFn?: (item: T, index: number) => string | number
): ForState<T> {
  const sourceState = typeof source === 'function' ? null : source;
  const parentInstance = getCurrentInstance();

  return {
    sourceState,
    items: new Map(),
    orderedKeys: [],
    byFn: byFn || defaultKeyFn,
    renderFn,
    parentInstance,
    mounted: false,
  };
}

let _forRenderCounter = 1;

export function createItemInstance<T>(
  key: string | number,
  item: T,
  index: number,
  forState: ForState<T>
): ForItemInstance<T> {
  // Create index signal manually without going through state() hook
  // to avoid hook order violations (each For item creates its signal dynamically)
  let indexValue = index;
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
  });

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
  itemComponent._pendingReadStates = new Set();

  const vnode = forState.renderFn(item, () => indexSignal());

  // Commit initial subscriptions so nested state changes will notify this
  // instance's pending task appropriately.
  finalizeReadSubscriptions(itemComponent);

  // Restore previous current instance
  setCurrentComponentInstance(savedInst);

  // Override the pending flush task for this item so that when nested state
  // changes we recompute this item's vnode and request the parent to re-render.
  itemComponent._pendingFlushTask = () => {
    const saved = getCurrentInstance();
    setCurrentComponentInstance(itemComponent);

    // Reset state index tracking for this re-render (same as executeComponentSync)
    itemComponent.stateIndexCheck = -1;

    // Reset read tracking for all existing state
    for (const state of itemComponent.stateValues) {
      if (state) {
        state._hasBeenRead = false;
      }
    }

    // Restore the global state index to where it was when this item was created
    // This ensures state() calls use the same indices as during initial render
    setStateIndex(startStateIndex);

    itemComponent._currentRenderToken = _forRenderCounter++;
    itemComponent._pendingReadStates = new Set();

    // Safely re-render into vnode slot for this item
    try {
      const newVnode = forState.renderFn(item, () => indexSignal());
      // Update the stored vnode for this item so future reconciles use it
      const inst = forState.items.get(key);
      if (inst) inst.vnode = newVnode;
      // Commit read subscriptions for this re-render
      finalizeReadSubscriptions(itemComponent);
    } finally {
      setCurrentComponentInstance(saved);
    }

    // Ask parent For boundary to re-render so DOM updates are applied
    const parent = forState.parentInstance;
    if (parent) parent._enqueueRun?.();
  };

  return {
    key,
    item,
    indexSignal,
    componentInstance: itemComponent,
    vnode,
    _startStateIndex: startStateIndex,
  };
}

export function reconcileForItems<T>(
  forState: ForState<T>,
  newArray: T[]
): VNode[] {
  const { items, orderedKeys, byFn } = forState;
  const newKeyMap = new Map<string | number, { item: T; index: number }>();

  // Build new key map
  for (let i = 0; i < newArray.length; i++) {
    const item = newArray[i];
    const key = byFn(item, i);
    newKeyMap.set(key, { item, index: i });
  }

  const newOrderedKeys: Array<string | number> = [];
  const resultVNodes: VNode[] = [];
  const toRemove = new Set(orderedKeys);

  // Process new array
  for (const [key, { item, index }] of newKeyMap) {
    toRemove.delete(key);
    newOrderedKeys.push(key);

    const existing = items.get(key);

    if (!existing) {
      // Added: create new item instance
      const itemInstance = createItemInstance(key, item, index, forState);
      items.set(key, itemInstance);
      resultVNodes.push(itemInstance.vnode);
    } else {
      // Exists: check if item changed (by identity)
      const itemChanged = existing.item !== item;
      const indexChanged = existing.indexSignal() !== index;

      if (itemChanged) {
        // Item data changed: update and re-execute
        existing.item = item;

        const savedInst = askrGlobal.__ASKR_CURRENT_INSTANCE__;
        askrGlobal.__ASKR_CURRENT_INSTANCE__ = existing.componentInstance;

        existing.vnode = forState.renderFn(item, () => existing.indexSignal());

        askrGlobal.__ASKR_CURRENT_INSTANCE__ = savedInst;
      }

      if (indexChanged) {
        // Index changed: update index signal (triggers re-render if index is used)
        existing.indexSignal.set(index);
      }

      resultVNodes.push(existing.vnode);
    }
  }

  // Remove deleted items
  for (const key of toRemove) {
    const itemInstance = items.get(key);
    if (itemInstance) {
      // Clean up component instance
      const instance = itemInstance.componentInstance;

      // Abort any pending operations
      instance.abortController.abort();

      // Run cleanup functions
      for (const cleanup of instance.cleanupFns) {
        try {
          cleanup();
        } catch (err) {
          if (process.env.NODE_ENV !== 'production') {
            console.error('[For] Cleanup error:', err);
          }
        }
      }

      items.delete(key);
    }
  }

  forState.orderedKeys = newOrderedKeys;
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
