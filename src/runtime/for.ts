/**
 * For primitive runtime
 *
 * Manages per-item component instances and array reconciliation
 * to eliminate over-invalidation in list rendering.
 */

import { type ComponentInstance, getCurrentInstance } from './component';
import { claimHookIndex } from './component';
import { type DOMElement, type VNode } from '../common/vnode';
import { isDevelopmentEnvironment } from '../common/env';
import { teardownNodeSubtree } from '../renderer/cleanup';
import {
  createChildScope,
  disposeChildScope,
  type ChildScope,
} from './child-scope';
import type { ForProps } from '../control/for';
import type { ForEachSource } from '../control/for';
import {
  markReactivePropsDirtySource,
  markReadableDerivedSubscribersDirty,
  notifyReadableReaders,
  recordReadableRead,
  type ReadableSource,
} from './readable';
import type { FineGrainedEffectHandle } from './effect';
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
  recordBenchEvent,
  recordBenchCounter,
  recordBenchTiming,
  resetBenchMetrics,
  withBenchMetricScope,
};

export interface ForItemInstance<T> {
  key: string | number;
  item: T;
  reactiveItem: T;
  itemSignal: ForItemSignal<T> | null;
  itemPropertySignals: Map<PropertyKey, ForItemPropertySignal> | null;
  indexSignal: ForIndexSignal;
  scope: ChildScope;
}

type ForItemSignal<T> = ReadableSource<T> &
  (() => T) & {
    peek(): T;
    set(newValue: T, notifyReaders?: boolean): void;
  };

type ForItemPropertySignal = ReadableSource<unknown> &
  (() => unknown) & {
    peek(): unknown;
    set(newValue: unknown, notifyReaders?: boolean): void;
  };

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
  eachSource: ForEachSource<T>;
  fallback: VNode | null;
  fallbackScope: ChildScope | null;
  items: Map<string | number, ForItemInstance<T>>;
  orderedKeys: Array<string | number>;
  orderedItems: ForItemInstance<T>[];
  orderedVNodes: VNode[];
  byFn: NonNullable<ForProps<T>['by']> | ((item: T, index: number) => number);
  renderFn: (item: T, index: () => number) => VNode;
  parentInstance: ComponentInstance | null;
  lastCommitStrategy: ForCommitStrategy;
  lastRemovedNodes: Node[];
  pendingDirtyIndices: number[] | null;
  pendingSwapIndices: [number, number] | null;
  pendingMoveOnly: boolean;
  _hasResolvedItemDom: boolean;
  _needsSourceReconcile: boolean;
  _sourceEffect: FineGrainedEffectHandle<T[]> | null;
  _suspendSourceCommit: boolean;
  _enqueueBoundaryCommit?: (() => void) | null;
  _hasPendingBoundaryCommit?: boolean;
  devKeyKinds?: Map<string, 'number' | 'string'>;
}

const forStates = new WeakMap<
  ComponentInstance,
  Map<number, ForState<unknown>>
>();

function getForStore(
  instance: ComponentInstance
): Map<number, ForState<unknown>> {
  let store = forStates.get(instance);
  if (!store) {
    store = new Map();
    forStates.set(instance, store);
  }
  return store;
}

export function createForState<T>(
  eachSource: ForEachSource<T>,
  byFn: ForState<T>['byFn'],
  renderFn: (item: T, index: () => number) => VNode,
  fallback: VNode | null
): ForState<T> {
  const parentInstance = getCurrentInstance();

  return {
    kind: 'for',
    currentItems: [],
    eachSource,
    fallback,
    fallbackScope: null,
    items: new Map(),
    orderedKeys: [],
    orderedItems: [],
    orderedVNodes: [],
    byFn,
    renderFn,
    parentInstance,
    lastCommitStrategy: 'NO_REORDER',
    lastRemovedNodes: [],
    pendingDirtyIndices: null,
    pendingSwapIndices: null,
    pendingMoveOnly: false,
    _hasResolvedItemDom: false,
    _needsSourceReconcile: false,
    _sourceEffect: null,
    _suspendSourceCommit: false,
    _enqueueBoundaryCommit: null,
    _hasPendingBoundaryCommit: false,
  };
}

export function useForState<T>(
  eachSource: ForEachSource<T>,
  byFn: ForState<T>['byFn'],
  renderFn: (item: T, index: () => number) => VNode,
  fallback: VNode | null
): ForState<T> {
  const instance = getCurrentInstance();
  if (!instance) {
    throw new Error(
      'For can only be created during component render execution.'
    );
  }

  const hookIndex = claimHookIndex(instance, 'For');
  const store = getForStore(instance);
  const existing = store.get(hookIndex) as ForState<T> | undefined;

  if (existing) {
    existing.eachSource = eachSource;
    existing.byFn = byFn;
    existing.renderFn = renderFn;
    existing.fallback = fallback;
    return existing;
  }

  const created = createForState(eachSource, byFn, renderFn, fallback);
  store.set(hookIndex, created as ForState<unknown>);

  (instance.cleanupFns ??= []).push(() => {
    created._sourceEffect?.cleanup();
    created._sourceEffect = null;
    store.delete(hookIndex);
  });

  return created;
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

function createForItemSignal<T>(initialItem: T): ForItemSignal<T> {
  let itemValue = initialItem;
  const readers = new Map<ComponentInstance, number>();

  const itemSignal = (() => {
    itemSignal._hasBeenRead = true;
    recordReadableRead(itemSignal);
    return itemValue;
  }) as ForItemSignal<T>;

  itemSignal._readers = readers;
  itemSignal.peek = () => itemValue;
  itemSignal.set = (newValue: T, notifyReaders = true) => {
    if (Object.is(itemValue, newValue)) {
      return;
    }

    itemValue = newValue;
    markReadableDerivedSubscribersDirty(itemSignal);
    markReactivePropsDirtySource(itemSignal);

    if (notifyReaders) {
      notifyReadableReaders(itemSignal);
    }
  };
  itemSignal._hasBeenRead = false;

  return itemSignal;
}

function createForItemPropertySignal(
  initialValue: unknown
): ForItemPropertySignal {
  let propertyValue = initialValue;
  const readers = new Map<ComponentInstance, number>();

  const propertySignal = (() => {
    propertySignal._hasBeenRead = true;
    recordReadableRead(propertySignal);
    return propertyValue;
  }) as ForItemPropertySignal;

  propertySignal._readers = readers;
  propertySignal.peek = () => propertyValue;
  propertySignal.set = (newValue: unknown, notifyReaders = true) => {
    if (Object.is(propertyValue, newValue)) {
      return;
    }

    propertyValue = newValue;
    markReadableDerivedSubscribersDirty(propertySignal);
    markReactivePropsDirtySource(propertySignal);

    if (notifyReaders) {
      notifyReadableReaders(propertySignal);
    }
  };
  propertySignal._hasBeenRead = false;

  return propertySignal;
}

function readForItemProperty(item: unknown, prop: PropertyKey): unknown {
  return Reflect.get(Object(item), prop);
}

function scopeReadsSource(
  scope: ChildScope,
  source: ReadableSource<unknown>
): boolean {
  return source._readers?.has(scope.componentInstance) ?? false;
}

function getOrCreateForItemPropertySignal<T>(
  item: T,
  propertySignals: Map<PropertyKey, ForItemPropertySignal>,
  prop: PropertyKey
): ForItemPropertySignal {
  const existingSignal = propertySignals.get(prop);
  if (existingSignal) {
    return existingSignal;
  }

  const propertySignal = createForItemPropertySignal(
    readForItemProperty(item, prop)
  );
  propertySignals.set(prop, propertySignal);
  return propertySignal;
}

function canProxyForItem(item: unknown): item is object {
  return (
    (typeof item === 'object' && item !== null) || typeof item === 'function'
  );
}

function createReactiveForItem<T>(
  itemSignal: ForItemSignal<T>,
  propertySignals: Map<PropertyKey, ForItemPropertySignal>
): T {
  const target = Object.create(null) as Record<string | symbol, unknown>;

  return new Proxy(target, {
    get(target, prop, receiver) {
      const ownDescriptor = Reflect.getOwnPropertyDescriptor(target, prop);
      if (ownDescriptor) {
        return Reflect.get(target, prop, receiver);
      }

      const currentItem = itemSignal.peek();

      if (typeof prop !== 'symbol') {
        return getOrCreateForItemPropertySignal(
          currentItem,
          propertySignals,
          prop
        )();
      }

      recordReadableRead(itemSignal);
      return Reflect.get(Object(currentItem), prop, receiver);
    },
    has(target, prop) {
      recordReadableRead(itemSignal);
      return prop in target || prop in Object(itemSignal.peek());
    },
    ownKeys(target) {
      recordReadableRead(itemSignal);
      const keys = new Set<string | symbol>(Reflect.ownKeys(target));
      for (const key of Reflect.ownKeys(Object(itemSignal.peek()))) {
        keys.add(key);
      }

      return Array.from(keys);
    },
    getOwnPropertyDescriptor(target, prop) {
      recordReadableRead(itemSignal);
      const ownDescriptor = Reflect.getOwnPropertyDescriptor(target, prop);
      if (ownDescriptor) {
        return ownDescriptor;
      }

      return Object.getOwnPropertyDescriptor(Object(itemSignal.peek()), prop);
    },
    getPrototypeOf() {
      recordReadableRead(itemSignal);
      return Object.getPrototypeOf(Object(itemSignal.peek()));
    },
  }) as T;
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
    if (domCleanup === 'teardown') {
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
  const itemSignal = canProxyForItem(item) ? createForItemSignal(item) : null;
  const itemPropertySignals = itemSignal
    ? new Map<PropertyKey, ForItemPropertySignal>()
    : null;
  const reactiveItem =
    itemSignal && itemPropertySignals
      ? createReactiveForItem(itemSignal, itemPropertySignals)
      : item;
  const scope = createChildScope(forState.parentInstance, key, () => {
    if (forState._enqueueBoundaryCommit) {
      forState._enqueueBoundaryCommit();
      return;
    }

    const parent = forState.parentInstance;
    if (parent) {
      parent._enqueueRun?.();
    }
  });

  renderItemScope(forState, scope, reactiveItem, indexSignal, key);

  const itemInstance: ForItemInstance<T> = {
    key,
    item,
    reactiveItem,
    itemSignal,
    itemPropertySignals,
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

function updateItemInstance<T>(
  forState: ForState<T>,
  itemInstance: ForItemInstance<T>,
  item: T
): boolean {
  if (itemInstance.item === item) {
    return false;
  }

  const previousItem = itemInstance.item;
  itemInstance.item = item;

  const scope = itemInstance.scope;
  let scopeReadsChangedSignal = false;
  const itemSignal = itemInstance.itemSignal;
  if (!itemSignal) {
    rerenderItemInstance(forState, itemInstance, item);
    return true;
  }

  const propertySignals = itemInstance.itemPropertySignals;
  const changedPropertySignals: Array<[ForItemPropertySignal, unknown]> = [];
  if (propertySignals && propertySignals.size > 0) {
    for (const [prop, propertySignal] of propertySignals) {
      const previousValue = readForItemProperty(previousItem, prop);
      const nextValue = readForItemProperty(item, prop);
      if (Object.is(previousValue, nextValue)) {
        continue;
      }

      if (scopeReadsSource(scope, propertySignal)) {
        scopeReadsChangedSignal = true;
      }

      changedPropertySignals.push([propertySignal, nextValue]);
    }
  }

  if (scopeReadsSource(scope, itemSignal)) {
    scopeReadsChangedSignal = true;
  }

  const notifyReaders = !scopeReadsChangedSignal;
  for (const [propertySignal, nextValue] of changedPropertySignals) {
    propertySignal.set(nextValue, notifyReaders);
  }
  itemSignal.set(item, notifyReaders);

  if (scopeReadsChangedSignal) {
    rerenderItemInstance(forState, itemInstance, itemInstance.reactiveItem);
    return true;
  }

  return false;
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
    if (domCleanup === 'teardown') {
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
    forState.orderedItems = [];
    return [];
  }

  const fallbackScope =
    forState.fallbackScope ??
    createChildScope(forState.parentInstance, FOR_FALLBACK_SCOPE_KEY, () => {
      if (forState._enqueueBoundaryCommit) {
        forState._enqueueBoundaryCommit();
        return;
      }

      forState.parentInstance?._enqueueRun?.();
    });
  forState.fallbackScope = fallbackScope;

  const vnode = fallbackScope.render(() => forState.fallback as VNode);
  forState.orderedVNodes = vnode == null || vnode === false ? [] : [vnode];
  forState.orderedItems = [];
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

            const itemChanged = existing.item !== item;
            const needsDomUpdate = existing.scope.needsDomUpdate;
            const indexChanged = existing.indexSignal.peek() !== i;

            if (itemChanged) {
              updateItemInstance(forState, existing, item);
            }

            if (indexChanged && existing.indexSignal._hasBeenRead) {
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
        const needsDomUpdate = existing.scope.needsDomUpdate;
        let rerendered = false;

        if (itemChanged) {
          rerendered = updateItemInstance(forState, existing, item);
        }

        if (rerendered || needsDomUpdate || existing.scope.needsDomUpdate) {
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

      if (
        firstExisting.indexSignal._hasBeenRead &&
        firstExisting.indexSignal.peek() !== firstMismatch
      ) {
        firstExisting.indexSignal.set(firstMismatch);
      }

      if (
        secondExisting.indexSignal._hasBeenRead &&
        secondExisting.indexSignal.peek() !== secondMismatch
      ) {
        secondExisting.indexSignal.set(secondMismatch);
      }

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

  // ─────────────────────────────────────────────────────────────────────────
  // FULL KEYED RECONCILIATION (slow path for complex reorders)
  // Avoid allocating newKeyMap: iterate directly and track removals
  // ─────────────────────────────────────────────────────────────────────────
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
      const indexChanged =
        existing.indexSignal._hasBeenRead && existing.indexSignal.peek() !== i;

      if (itemChanged) {
        moveOnly = false;
        updateItemInstance(forState, existing, item);
      }

      if (indexChanged) {
        // Index changed: update index signal (triggers re-render if index is used)
        existing.indexSignal.set(i);
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

export function evaluateForState<T>(forState: ForState<T>): VNode[] {
  if (!Array.isArray(forState.currentItems)) {
    throw new Error('For source must evaluate to an array');
  }

  forState._needsSourceReconcile = false;
  return reconcileForItems(forState, forState.currentItems);
}

export function clearForDomUpdateState<T>(forState: ForState<T>): void {
  const dirtyIndices = forState.pendingDirtyIndices;
  if (dirtyIndices && dirtyIndices.length > 0) {
    for (let i = 0; i < dirtyIndices.length; i++) {
      const itemInstance = forState.orderedItems[dirtyIndices[i]];
      if (itemInstance) {
        itemInstance.scope.needsDomUpdate = false;
      }
    }
  } else {
    for (let i = 0; i < forState.orderedKeys.length; i++) {
      const key = forState.orderedKeys[i];
      const itemInstance = forState.items.get(key);
      if (itemInstance) {
        itemInstance.scope.needsDomUpdate = false;
      }
    }
  }

  if (forState.fallbackScope) {
    forState.fallbackScope.needsDomUpdate = false;
  }
  forState.lastRemovedNodes = [];
  forState.pendingDirtyIndices = null;
  forState.pendingSwapIndices = null;
  forState.pendingMoveOnly = false;
  forState._needsSourceReconcile = false;
}
