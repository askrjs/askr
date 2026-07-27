/**
 * For primitive runtime
 *
 * Manages For state storage, hook binding, source evaluation,
 * and DOM update state cleanup.
 */

import { type ComponentInstance, getCurrentInstance } from './component';
import { claimHookIndex } from './component';
import type { VNode } from '../common/vnode';
import {
  disposeChildScope,
  restoreChildScopeTransactionSnapshot,
  type ChildScope,
  type ChildScopeTransactionSnapshot,
} from './child-scope';
import { refreshForContextScopes, type ForItemInstance } from './for-scopes';
import {
  notifyForSignalReaders,
  removeForParentReaders,
  type ForIndexSignal,
  type ForItemPropertySignal,
} from './for-signals';
import type { ReadableSource } from './readable';
import type { ChildScopeOwnership } from './child-scope';
import { registerOwnedChildScope } from './component';
import type { FineGrainedEffectHandle } from './effect';
import type { ForEachSource, ForKeySelector, ForRenderItem } from './for-types';
import { reconcileForItems } from './for-reconcile';
import { registerLifecycleTransaction } from './component-lifecycle';
import { getRuntimeRenderer } from './access';
import { logger } from '../common/logger';
import type { DOMRange } from '../common/dom-range';
import type { ContextFrame } from './context';
import { recordBenchCounter, recordBenchTiming } from './for-bench';

declare const __ASKR_BENCH_BUILD__: boolean;
const BENCH_BUILD_ENABLED = __ASKR_BENCH_BUILD__;

export {
  getBenchMetrics,
  isBenchMetricScopeActive,
  recordBenchEvent,
  recordBenchCounter,
  recordBenchTiming,
  resetBenchMetrics,
  withBenchMetricScope,
} from './for-bench';

export { reconcileForItems };

export type ForCommitStrategy =
  | 'APPEND'
  | 'INSERT_ONE'
  | 'REMOVE_ONE'
  | 'TRUNCATE'
  | 'NO_REORDER'
  | 'SWAP'
  | 'FULL_KEYED';

export interface ForState<T> {
  kind: 'for';
  _contextFrame: ContextFrame | null;
  _contextFrameChanged: boolean;
  currentItems: readonly T[];
  _committedItems: readonly T[];
  eachSource: ForEachSource<T>;
  fallback: VNode | null;
  fallbackScope: ChildScope | null;
  items: Map<string | number, ForItemInstance<T>>;
  orderedKeys: Array<string | number>;
  orderedItems: ForItemInstance<T>[];
  orderedVNodes: VNode[];
  byFn: ForKeySelector<T>;
  renderFn: ForRenderItem<T>;
  parentInstance: ComponentInstance | null;
  lastCommitStrategy: ForCommitStrategy;
  lastRemovedNodes: Node[];
  lastRemovedRanges: DOMRange[];
  pendingDirtyIndices: number[] | null;
  pendingSwapIndices: [number, number] | null;
  pendingMoveOnly: boolean;
  pendingInsertedIndex: number | null;
  pendingRemovedKey: string | number | null;
  pendingAppendStart: number | null;
  _hasResolvedItemDom: boolean;
  _needsSourceReconcile: boolean;
  _sourceEffect: FineGrainedEffectHandle<readonly T[]> | null;
  _suspendSourceCommit: boolean;
  _enqueueBoundaryCommit?: (() => void) | null;
  _hasPendingBoundaryCommit?: boolean;
  devKeyKinds?: Map<string | number, 'number' | 'string'>;
  _transaction?: ForTransaction<T> | null;
  _scopeOwnership: ChildScopeOwnership;
}

export interface ForItemTransactionSnapshot<T> {
  item: T;
  itemSignalExists: boolean;
  itemSignalValue: T | undefined;
  itemSignalHasBeenRead: boolean;
  indexValue: number;
  indexHasBeenRead: boolean;
  propertySignalStore: Map<PropertyKey, ForItemPropertySignal> | null;
  propertySignals: Map<
    PropertyKey,
    {
      signal: ForItemPropertySignal;
      value: unknown;
      hasBeenRead: boolean;
    }
  > | null;
  scope: ChildScopeTransactionSnapshot;
}

export interface ForTransaction<T> {
  collectionSnapshotMode: 'copy' | 'reset-empty' | 'preserve-clear' | 'reuse';
  currentItems: readonly T[];
  items: Map<string | number, ForItemInstance<T>>;
  orderedKeys: Array<string | number>;
  orderedItems: ForItemInstance<T>[];
  orderedVNodes: VNode[];
  fallbackScope: ChildScope | null;
  lastCommitStrategy: ForCommitStrategy;
  lastRemovedNodes: Node[];
  lastRemovedRanges: DOMRange[];
  pendingDirtyIndices: number[] | null;
  pendingSwapIndices: [number, number] | null;
  pendingMoveOnly: boolean;
  pendingInsertedIndex: number | null;
  pendingRemovedKey: string | number | null;
  pendingAppendStart: number | null;
  hasResolvedItemDom: boolean;
  needsSourceReconcile: boolean;
  devKeyKinds?: Map<string | number, 'number' | 'string'>;
  itemSnapshots: Map<ForItemInstance<T>, ForItemTransactionSnapshot<T>> | null;
  unreadIndexSnapshots: Map<ForIndexSignal, number> | null;
  fallbackScopeSnapshot: ChildScopeTransactionSnapshot | null;
  removedScopes: ChildScope[] | null;
  removedScopeNodes: Node[] | null;
  removeAllItems: boolean;
  signalEffects: Map<
    ReadableSource<unknown>,
    {
      parentInstance: ComponentInstance | null;
      notify: boolean;
      skipInstance: ComponentInstance | null;
      skipOwnedBy: ComponentInstance | null;
    }
  > | null;
  shouldClearDomUpdateState: boolean;
}

const forStates = new WeakMap<object, Map<number, ForState<unknown>>>();

function getForStore(
  instance: ComponentInstance
): Map<number, ForState<unknown>> {
  const generation = instance._ownershipGeneration;
  let store = forStates.get(generation);
  if (!store) {
    store = new Map();
    forStates.set(generation, store);
  }
  return store;
}

export function createForState<T>(
  eachSource: ForEachSource<T>,
  byFn: ForState<T>['byFn'],
  renderFn: ForRenderItem<T>,
  fallback: VNode | null
): ForState<T> {
  const parentInstance = getCurrentInstance();
  const ownedScopes = new Set<ChildScope>();
  let bulkDisposing = false;
  const scopeOwnership: ChildScopeOwnership = {
    add: (scope) => ownedScopes.add(scope),
    delete: (scope) => (bulkDisposing ? false : ownedScopes.delete(scope)),
    bulkDispose(run) {
      bulkDisposing = true;
      try {
        run();
      } finally {
        bulkDisposing = false;
        ownedScopes.clear();
      }
    },
  };
  if (parentInstance) {
    registerOwnedChildScope(parentInstance, {
      key: 'for-boundary',
      dispose() {
        scopeOwnership.bulkDispose(() => {
          const errors: unknown[] = [];
          for (const scope of ownedScopes) {
            try {
              scope.dispose();
            } catch (error) {
              errors.push(error);
            }
          }
          if (errors.length > 0) {
            throw new AggregateError(errors, 'For scope cleanup failed');
          }
        });
      },
    });
  }

  return {
    kind: 'for',
    _contextFrame: null,
    _contextFrameChanged: false,
    currentItems: [],
    _committedItems: [],
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
    lastRemovedRanges: [],
    pendingDirtyIndices: null,
    pendingSwapIndices: null,
    pendingMoveOnly: false,
    pendingInsertedIndex: null,
    pendingRemovedKey: null,
    pendingAppendStart: null,
    _hasResolvedItemDom: false,
    _needsSourceReconcile: false,
    _sourceEffect: null,
    _suspendSourceCommit: false,
    _enqueueBoundaryCommit: null,
    _scopeOwnership: scopeOwnership,
    _hasPendingBoundaryCommit: false,
    _transaction: null,
  };
}

export function useForState<T>(
  eachSource: ForEachSource<T>,
  byFn: ForState<T>['byFn'],
  renderFn: ForRenderItem<T>,
  fallback: VNode | null
): ForState<T> {
  const instance = getCurrentInstance();
  if (!instance) {
    throw new Error(
      'For can only be created during component render execution.'
    );
  }

  const hookIndex = claimHookIndex(instance, 'For');
  const generation = instance._ownershipGeneration;
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
    if (store.size === 0 && forStates.get(generation) === store) {
      forStates.delete(generation);
    }
  });

  return created;
}

export function evaluateForState<T>(forState: ForState<T>): VNode[] {
  if (!Array.isArray(forState.currentItems)) {
    throw new Error('For source must evaluate to an array');
  }

  beginForStateTransaction(forState);
  forState._needsSourceReconcile = false;
  try {
    if (forState._contextFrameChanged) {
      refreshForContextScopes(forState);
    }
    const result = reconcileForItems(forState, forState.currentItems);
    forState._contextFrameChanged = false;
    return result;
  } catch (error) {
    rollbackForStateTransaction(forState);
    throw error;
  }
}

/**
 * Reconciliation changes ownership before DOM work can fail. Keep a private
 * structural snapshot until the boundary has committed so failed work cannot
 * leave provisional child scopes in the parent owner graph.
 */
export function beginForStateTransaction<T>(
  forState: ForState<T>,
  collectionMode: 'auto' | 'reuse' = 'auto'
): void {
  if (forState._transaction) return;

  const hasEmptyCollections =
    forState.items.size === 0 &&
    forState.orderedKeys.length === 0 &&
    forState.orderedItems.length === 0 &&
    forState.orderedVNodes.length === 0;
  const isFullClear =
    forState.currentItems.length === 0 && forState.orderedKeys.length > 0;
  const collectionSnapshotMode =
    collectionMode === 'reuse'
      ? 'reuse'
      : hasEmptyCollections
        ? 'reset-empty'
        : isFullClear
          ? 'preserve-clear'
          : 'copy';

  const transaction: ForTransaction<T> = {
    collectionSnapshotMode,
    currentItems: forState._committedItems,
    items:
      collectionSnapshotMode === 'copy'
        ? new Map(forState.items)
        : forState.items,
    orderedKeys:
      collectionSnapshotMode === 'copy'
        ? forState.orderedKeys.slice()
        : forState.orderedKeys,
    orderedItems:
      collectionSnapshotMode === 'copy'
        ? forState.orderedItems.slice()
        : forState.orderedItems,
    orderedVNodes:
      collectionSnapshotMode === 'copy'
        ? forState.orderedVNodes.slice()
        : forState.orderedVNodes,
    fallbackScope: forState.fallbackScope,
    lastCommitStrategy: forState.lastCommitStrategy,
    lastRemovedNodes: forState.lastRemovedNodes,
    lastRemovedRanges: forState.lastRemovedRanges,
    pendingDirtyIndices: forState.pendingDirtyIndices,
    pendingSwapIndices: forState.pendingSwapIndices,
    pendingMoveOnly: forState.pendingMoveOnly,
    pendingInsertedIndex: forState.pendingInsertedIndex,
    pendingRemovedKey: forState.pendingRemovedKey,
    pendingAppendStart: forState.pendingAppendStart,
    hasResolvedItemDom: forState._hasResolvedItemDom,
    needsSourceReconcile: forState._needsSourceReconcile,
    devKeyKinds: forState.devKeyKinds,
    itemSnapshots: null,
    unreadIndexSnapshots: null,
    fallbackScopeSnapshot: null,
    removedScopes: null,
    removedScopeNodes: null,
    removeAllItems: false,
    signalEffects: null,
    shouldClearDomUpdateState: false,
  };
  forState._transaction = transaction;
  registerForStateTransaction(forState, transaction);
}

export function registerForStateTransaction<T>(
  forState: ForState<T>,
  transaction = forState._transaction
): boolean {
  if (!transaction || forState._transaction !== transaction) {
    return false;
  }

  return registerLifecycleTransaction(
    transaction,
    () => commitForStateTransaction(forState, transaction),
    () => rollbackForStateTransaction(forState, transaction)
  );
}

function finalizeForStateRemovals<T>(
  forState: ForState<T>,
  transaction: ForTransaction<T>
): void {
  const removedScopes = transaction.removedScopes;
  if (!transaction.removeAllItems && !removedScopes) {
    return;
  }

  const lifecycleStartMs = BENCH_BUILD_ENABLED ? performance.now() : 0;
  const cleanupErrors: unknown[] = [];
  const finalizeScope = (scope: ChildScope): void => {
    const removedDom = scope.dom;
    const removedRange = scope.range;
    const disposalStartMs = BENCH_BUILD_ENABLED ? performance.now() : 0;
    try {
      disposeChildScope(scope);
    } catch (error) {
      cleanupErrors.push(error);
    }
    if (BENCH_BUILD_ENABLED) {
      recordBenchCounter('scopesDisposed');
      recordBenchTiming(
        'childScopeDisposal',
        performance.now() - disposalStartMs
      );
    }

    if (transaction.removedScopeNodes) {
      return;
    }

    if (typeof Element !== 'undefined' && removedDom instanceof Element) {
      const teardownStartMs = BENCH_BUILD_ENABLED ? performance.now() : 0;
      try {
        getRuntimeRenderer().teardownNodeSubtree(removedDom);
        if (BENCH_BUILD_ENABLED) recordBenchCounter('subtreeTeardowns');
      } catch (error) {
        cleanupErrors.push(error);
      }
      if (BENCH_BUILD_ENABLED) {
        recordBenchTiming(
          'domMetadataTeardown',
          performance.now() - teardownStartMs
        );
      }
    }
    if (removedRange && !removedRange.single) {
      for (
        let node = removedRange.start.nextSibling;
        node && node !== removedRange.end;
      ) {
        const next = node.nextSibling;
        try {
          // A component may commit to a comment or text host. The keyed DOM
          // phase detaches ranges without teardown so rollback can restore
          // them; once commit succeeds, every interior host must be finalized.
          getRuntimeRenderer().teardownNodeSubtree(node);
          if (BENCH_BUILD_ENABLED) recordBenchCounter('subtreeTeardowns');
        } catch (error) {
          cleanupErrors.push(error);
        }
        node = next;
      }
    }
  };

  if (transaction.removeAllItems) {
    forState._scopeOwnership.bulkDispose(() => {
      for (let index = 0; index < transaction.orderedItems.length; index++) {
        const item = transaction.orderedItems[index];
        if (item) {
          finalizeScope(item.scope);
        }
      }
    });
  }

  for (const scope of removedScopes ?? []) {
    finalizeScope(scope);
  }

  const removedScopeNodes = transaction.removedScopeNodes;
  if (removedScopeNodes) {
    const teardownStartMs = BENCH_BUILD_ENABLED ? performance.now() : 0;
    for (const node of removedScopeNodes) {
      try {
        getRuntimeRenderer().teardownNodeSubtree(node);
        if (BENCH_BUILD_ENABLED) recordBenchCounter('subtreeTeardowns');
      } catch (error) {
        cleanupErrors.push(error);
      }
    }
    if (BENCH_BUILD_ENABLED) {
      recordBenchTiming(
        'domMetadataTeardown',
        performance.now() - teardownStartMs
      );
    }
  }

  if (removedScopes) {
    removedScopes.length = 0;
  }
  if (removedScopeNodes) {
    removedScopeNodes.length = 0;
  }
  transaction.removeAllItems = false;
  if (BENCH_BUILD_ENABLED) {
    recordBenchTiming(
      'lifecycleFinalization',
      performance.now() - lifecycleStartMs
    );
  }
  if (cleanupErrors.length > 0) {
    logger.error(
      '[Askr] For removal cleanup failed:',
      new AggregateError(cleanupErrors, 'For removal cleanup failed')
    );
  }
}

function finalizeForSignalEffects<T>(transaction: ForTransaction<T>): void {
  if (!transaction.signalEffects) {
    return;
  }

  for (const [source, effect] of transaction.signalEffects) {
    removeForParentReaders(effect.parentInstance, source);
    if (effect.notify) {
      notifyForSignalReaders(source, effect.skipInstance, effect.skipOwnedBy);
    }
  }
  transaction.signalEffects.clear();
}

function finalizeForDomUpdateFlags<T>(forState: ForState<T>): void {
  for (let index = 0; index < forState.orderedItems.length; index++) {
    const item = forState.orderedItems[index];
    if (item) {
      item.scope.needsDomUpdate = false;
    }
  }
  if (forState.fallbackScope) {
    forState.fallbackScope.needsDomUpdate = false;
  }
}

export function commitForStateTransaction<T>(
  forState: ForState<T>,
  transaction = forState._transaction
): void {
  if (!transaction || forState._transaction !== transaction) return;
  const finalizationStartMs = BENCH_BUILD_ENABLED ? performance.now() : 0;
  try {
    finalizeForStateRemovals(forState, transaction);
    finalizeForSignalEffects(transaction);
    if (transaction.shouldClearDomUpdateState) {
      finalizeForDomUpdateFlags(forState);
    }
  } finally {
    transaction.itemSnapshots?.clear();
    transaction.unreadIndexSnapshots?.clear();
    transaction.fallbackScopeSnapshot = null;
    forState._committedItems = forState.currentItems;
    forState._transaction = null;
    if (BENCH_BUILD_ENABLED) {
      recordBenchTiming(
        'transactionFinalization',
        performance.now() - finalizationStartMs
      );
    }
  }
}

export function rollbackForStateTransaction<T>(
  forState: ForState<T>,
  transaction = forState._transaction
): void {
  if (!transaction || forState._transaction !== transaction) return;

  const rollbackCleanupErrors: unknown[] = [];
  const scopesToDispose = new Set<ChildScope>();
  const committedScopes =
    transaction.collectionSnapshotMode === 'reset-empty'
      ? null
      : new Set(transaction.orderedItems.map((item) => item.scope));
  if (transaction.fallbackScope) {
    committedScopes?.add(transaction.fallbackScope);
  }

  // A scope is registered with its parent before its first render. Dispose
  // every scope that did not exist at transaction start before restoring the
  // structural collections.
  if (transaction.collectionSnapshotMode === 'reset-empty') {
    for (const item of forState.items.values()) {
      scopesToDispose.add(item.scope);
    }
  } else {
    for (const [key, item] of forState.items) {
      if (transaction.items.get(key) !== item) {
        scopesToDispose.add(item.scope);
      }
    }
  }

  for (const scope of transaction.removedScopes ?? []) {
    if (scope !== transaction.fallbackScope && !committedScopes?.has(scope)) {
      scopesToDispose.add(scope);
    }
  }

  if (
    forState.fallbackScope &&
    forState.fallbackScope !== transaction.fallbackScope
  ) {
    scopesToDispose.add(forState.fallbackScope);
  }

  for (const scope of scopesToDispose) {
    try {
      disposeChildScope(scope);
    } catch (error) {
      rollbackCleanupErrors.push(error);
    }
  }

  if (transaction.collectionSnapshotMode === 'reset-empty') {
    forState.items.clear();
    forState.orderedKeys.length = 0;
    forState.orderedItems.length = 0;
    forState.orderedVNodes.length = 0;
  }

  for (const [itemInstance, snapshot] of transaction.itemSnapshots ?? []) {
    itemInstance.item = snapshot.item;
    const reactiveItemState = itemInstance.reactiveItemState;
    if (reactiveItemState) {
      reactiveItemState.currentItem = snapshot.item;
    }
    const itemSignal = reactiveItemState?.itemSignal;
    if (itemSignal && snapshot.itemSignalExists) {
      itemSignal.set(snapshot.itemSignalValue as T, false);
      itemSignal._hasBeenRead = snapshot.itemSignalHasBeenRead;
    }
    itemInstance.indexSignal.set(snapshot.indexValue, false);
    itemInstance.indexSignal._hasBeenRead = snapshot.indexHasBeenRead;

    const propertySignals = snapshot.propertySignalStore;
    if (reactiveItemState) {
      reactiveItemState.propertySignals = propertySignals;
    }
    if (propertySignals) {
      propertySignals.clear();
      for (const [property, propertySnapshot] of snapshot.propertySignals ??
        []) {
        propertySnapshot.signal.set(propertySnapshot.value, false);
        propertySnapshot.signal._hasBeenRead = propertySnapshot.hasBeenRead;
        propertySignals.set(property, propertySnapshot.signal);
      }
    }

    restoreChildScopeTransactionSnapshot(itemInstance.scope, snapshot.scope);
  }

  for (const [indexSignal, index] of transaction.unreadIndexSnapshots ?? []) {
    indexSignal.set(index, false);
  }

  if (transaction.fallbackScope && transaction.fallbackScopeSnapshot) {
    restoreChildScopeTransactionSnapshot(
      transaction.fallbackScope,
      transaction.fallbackScopeSnapshot
    );
  }

  forState.currentItems = transaction.currentItems;
  forState._committedItems = transaction.currentItems;
  forState.items = transaction.items;
  forState.orderedKeys = transaction.orderedKeys;
  forState.orderedItems = transaction.orderedItems;
  forState.orderedVNodes = transaction.orderedVNodes;
  forState.fallbackScope = transaction.fallbackScope;
  forState.lastCommitStrategy = transaction.lastCommitStrategy;
  forState.lastRemovedNodes = transaction.lastRemovedNodes;
  forState.lastRemovedRanges = transaction.lastRemovedRanges;
  forState.pendingDirtyIndices = transaction.pendingDirtyIndices;
  forState.pendingSwapIndices = transaction.pendingSwapIndices;
  forState.pendingMoveOnly = transaction.pendingMoveOnly;
  forState.pendingInsertedIndex = transaction.pendingInsertedIndex;
  forState.pendingRemovedKey = transaction.pendingRemovedKey;
  forState.pendingAppendStart = transaction.pendingAppendStart;
  forState._hasResolvedItemDom = transaction.hasResolvedItemDom;
  forState._needsSourceReconcile = transaction.needsSourceReconcile;
  forState.devKeyKinds = transaction.devKeyKinds;
  forState._transaction = null;

  if (rollbackCleanupErrors.length > 0) {
    logger.error(
      '[Askr] transaction rollback cleanup failed:',
      new AggregateError(
        rollbackCleanupErrors,
        'Transaction rollback cleanup failed'
      )
    );
  }
}

export function clearForDomUpdateState<T>(forState: ForState<T>): void {
  const transaction = forState._transaction;
  if (transaction) {
    transaction.shouldClearDomUpdateState = true;
  }
  if (transaction && !registerForStateTransaction(forState, transaction)) {
    commitForStateTransaction(forState, transaction);
  }
  if (!transaction) {
    finalizeForDomUpdateFlags(forState);
  }
  forState.lastRemovedNodes = [];
  forState.lastRemovedRanges = [];
  forState.pendingDirtyIndices = null;
  forState.pendingSwapIndices = null;
  forState.pendingMoveOnly = false;
  forState.pendingInsertedIndex = null;
  forState.pendingRemovedKey = null;
  forState.pendingAppendStart = null;
  forState._needsSourceReconcile = false;
  forState._hasResolvedItemDom = forState.orderedKeys.length > 0;
}
