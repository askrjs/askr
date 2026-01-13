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
}

export interface ForState<T> {
  sourceState: State<T[]> | null;
  items: Map<string | number, ForItemInstance<T>>;
  orderedKeys: Array<string | number>;
  byFn: (item: T, index: number) => string | number;
  renderFn: (item: T, index: () => number) => VNode;
  parentInstance: ComponentInstance | null;
  mounted: boolean;
}

const defaultKeyFn = <T>(item: T, index: number): string | number => {
  if (item != null && typeof item === 'object' && 'id' in item) {
    return (item as { id: string | number }).id;
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

  // Create isolated component for this item. The renderFn is executed manually
  // below while this instance is the current component, so the instance fn is
  // a no-op used only for lifecycle bookkeeping.
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

  // Execute render function directly within the item component context
  const savedInstanceForRender = askrGlobal.__ASKR_CURRENT_INSTANCE__;
  askrGlobal.__ASKR_CURRENT_INSTANCE__ = itemComponent;

  const vnode = forState.renderFn(item, () => indexSignal());

  askrGlobal.__ASKR_CURRENT_INSTANCE__ = savedInstanceForRender;

  return {
    key,
    item,
    indexSignal,
    componentInstance: itemComponent,
    vnode,
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
