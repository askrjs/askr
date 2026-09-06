/**
 * For item and fallback child-scope ownership.
 */

import type { DOMElement, VNode } from '../../common/vnode';
import type { DOMRange } from '../../common/dom-range';
import { isDevelopmentEnvironment } from '../../common/env';
import { type ComponentInstance } from '../component/instance';
import {
  captureChildScopeTransactionSnapshot,
  createChildScope,
  disposeChildScope,
  type ChildScope,
} from '../ownership/child-scope';
import {
  canProxyForItem,
  createForIndexSignal,
  createReactiveForItem,
  haveSameOwnKeys,
  notifyForSignalReaders,
  readForItemProperty,
  removeForParentReaders,
  scopeDirectlyReadsSource,
  scopeReadsSource,
  syncForIndexSignal,
  type ForIndexSignal,
  type ForItemPropertySignal,
  type ReactiveForItemState,
} from './for-signals';
import { getRuntimeScopes } from '../access';
import { recordBenchCounter, recordBenchEvent } from '../diagnostics/for-bench';
import type { ForItemTransactionSnapshot, ForState } from './for-state';
import type { ReadableSource } from '../reactivity/readable';

declare const __ASKR_BENCH_BUILD__: boolean;

const BENCH_BUILD_ENABLED = __ASKR_BENCH_BUILD__;

export interface ForItemInstance<T> {
  key: string | number;
  item: T;
  reactiveItem: T;
  reactiveItemState: ReactiveForItemState<T> | null;
  indexSignal: ForIndexSignal;
  scope: ChildScope;
}

export type RemovedDomCleanupMode = 'none' | 'teardown' | 'full-clear';

function recordRemovedBoundary<T>(
  forState: ForState<T>,
  dom: Node | undefined,
  range: DOMRange | undefined
): void {
  if (BENCH_BUILD_ENABLED && (dom || range)) {
    recordBenchCounter('removedBoundariesRecorded');
  }
  getRuntimeScopes().recordRemovedScopeBoundary(
    dom,
    range,
    forState.lastRemovedNodes,
    forState.lastRemovedRanges
  );
}

function prepareRemovedScope<T>(forState: ForState<T>, scope: ChildScope) {
  const transaction = forState._transaction;
  if (!transaction) return getRuntimeScopes().resolveScopeBoundary(scope);
  const boundary = getRuntimeScopes().prepareScopeRemoval(
    scope,
    forState.lastRemovedNodes,
    forState.lastRemovedRanges,
    (transaction.removedScopeNodes ??= [])
  );
  if (BENCH_BUILD_ENABLED && (boundary.dom || boundary.range))
    recordBenchCounter('removedBoundariesRecorded');
  return boundary;
}

function enqueueForScopeUpdate(parent: ComponentInstance | null): void {
  parent?._enqueueRun?.();
}

const forStatesByScope = new WeakMap<ChildScope, ForState<unknown>>();

function enqueueForBoundaryScopeCommit(this: ChildScope): void {
  const forState =
    (this.blueprintOwner as ForState<unknown> | undefined) ??
    forStatesByScope.get(this);
  if (!forState) {
    return;
  }
  if (forState._enqueueBoundaryCommit) {
    forState._enqueueBoundaryCommit();
    return;
  }
  enqueueForScopeUpdate(forState.parentInstance);
}

function createForOwnedChildScope<T>(
  forState: ForState<T>,
  key: string | number
): ChildScope {
  const scope = createChildScope(
    forState.parentInstance,
    key,
    enqueueForBoundaryScopeCommit,
    forState._scopeOwnership
  );
  if (forState._contextFrame) {
    scope.componentInstance.ownerFrame = forState._contextFrame;
  }
  return scope;
}

export function captureForItemTransactionSnapshot<T>(
  forState: ForState<T>,
  itemInstance: ForItemInstance<T>
): void {
  const transaction = forState._transaction;
  if (!transaction || transaction.itemSnapshots?.has(itemInstance)) {
    return;
  }

  if (
    transaction.collectionSnapshotMode === 'reset-empty' ||
    transaction.items.get(itemInstance.key) !== itemInstance
  ) {
    return;
  }

  const itemSnapshots = (transaction.itemSnapshots ??= new Map());

  const propertySignals =
    itemInstance.reactiveItemState?.propertySignals ?? null;
  const itemSignal = itemInstance.reactiveItemState?.itemSignal ?? null;
  const propertySnapshots: ForItemTransactionSnapshot<T>['propertySignals'] =
    propertySignals && propertySignals.size > 0
      ? new Map(
          Array.from(propertySignals, ([property, signal]) => [
            property,
            {
              signal,
              value: signal.peek(),
              hasBeenRead: signal._hasBeenRead === true,
            },
          ])
        )
      : null;

  itemSnapshots.set(itemInstance, {
    item: itemInstance.item,
    itemSignalExists: itemSignal !== null,
    itemSignalValue: itemSignal?.peek(),
    itemSignalHasBeenRead: itemSignal?._hasBeenRead === true,
    indexValue: itemInstance.indexSignal.peek(),
    indexHasBeenRead: itemInstance.indexSignal._hasBeenRead === true,
    propertySignalStore: propertySignals,
    propertySignals: propertySnapshots,
    scope: captureChildScopeTransactionSnapshot(itemInstance.scope),
  });
}

export function captureForFallbackTransactionSnapshot<T>(
  forState: ForState<T>,
  fallbackScope = forState.fallbackScope
): void {
  const transaction = forState._transaction;
  if (
    !transaction ||
    !fallbackScope ||
    transaction.fallbackScope !== fallbackScope ||
    transaction.fallbackScopeSnapshot
  ) {
    return;
  }

  transaction.fallbackScopeSnapshot =
    captureChildScopeTransactionSnapshot(fallbackScope);
}

function stageForSignalEffect<T>(
  forState: ForState<T>,
  source: ReadableSource<unknown>,
  notify: boolean,
  skipInstance: ComponentInstance | null = null,
  skipOwnedBy: ComponentInstance | null = null
): boolean {
  const transaction = forState._transaction;
  if (!transaction) {
    return false;
  }

  const effects = (transaction.signalEffects ??= new Map());
  const existing = effects.get(source);
  if (existing) {
    existing.notify ||= notify;
    if (existing.skipInstance !== skipInstance) {
      existing.skipInstance = null;
    }
    if (existing.skipOwnedBy !== skipOwnedBy) {
      existing.skipOwnedBy = null;
    }
  } else {
    effects.set(source, {
      parentInstance: forState.parentInstance,
      notify,
      skipInstance,
      skipOwnedBy,
    });
  }
  return true;
}

export function syncForItemIndex<T>(
  forState: ForState<T>,
  itemInstance: ForItemInstance<T>,
  nextIndex: number
): boolean {
  const indexSignal = itemInstance.indexSignal;
  const previousIndex = indexSignal.peek();
  if (previousIndex === nextIndex) {
    return false;
  }

  if (indexSignal._hasBeenRead !== true) {
    const transaction = forState._transaction;
    if (transaction) {
      const snapshots = (transaction.unreadIndexSnapshots ??= new Map());
      if (!snapshots.has(indexSignal)) {
        snapshots.set(indexSignal, previousIndex);
      }
    }
    indexSignal.set(nextIndex, false);
    return false;
  }

  captureForItemTransactionSnapshot(forState, itemInstance);

  const scopeReadsIndex = scopeReadsSource(itemInstance.scope, indexSignal);
  const scopeDirectlyReadsIndex = scopeDirectlyReadsSource(
    itemInstance.scope,
    indexSignal
  );
  if (forState._transaction) {
    const shouldNotify = indexSignal._hasBeenRead === true;
    indexSignal.set(nextIndex, false);
    stageForSignalEffect(
      forState,
      indexSignal,
      shouldNotify,
      scopeReadsIndex ? itemInstance.scope.componentInstance : null
    );
    if (!scopeReadsIndex) {
      return false;
    }

    if (scopeDirectlyReadsIndex) {
      rerenderItemInstance(forState, itemInstance, itemInstance.reactiveItem);
    } else {
      itemInstance.scope.markDirty();
    }
    return true;
  }

  if (!scopeReadsIndex) {
    syncForIndexSignal(indexSignal, nextIndex);
    return false;
  }

  indexSignal.set(nextIndex, false);
  notifyForSignalReaders(indexSignal, itemInstance.scope.componentInstance);

  rerenderItemInstance(forState, itemInstance, itemInstance.reactiveItem);

  return true;
}

function materializeItemVnode<T>(
  forState: ForState<T>,
  key: string | number,
  vnode: VNode | undefined
): void {
  if (vnode && typeof vnode === 'object' && 'type' in vnode) {
    const vn = vnode as DOMElement;
    vn.key = key;

    if (forState.parentInstance?.ssr && typeof vn.type === 'string') {
      if (!vn.props) vn.props = {};
      if (vn.props['data-key'] === undefined) {
        vn.props['data-key'] = String(key);
      }
      if (vn.props['data-askr-key-kind'] === undefined) {
        vn.props['data-askr-key-kind'] = typeof key;
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
  if (BENCH_BUILD_ENABLED) {
    recordBenchEvent('rowFactory');
  }
  const vnode = scope.render(() => forState.renderFn(item, indexSignal));
  materializeItemVnode(forState, key, vnode);
  return vnode;
}

export function disposeItemInstance<T>(
  forState: ForState<T>,
  itemInstance: ForItemInstance<T>,
  domCleanup: RemovedDomCleanupMode
): void {
  if (BENCH_BUILD_ENABLED) {
    recordBenchEvent('itemRemoved');
  }
  const { dom: removedDom, range: removedRange } = prepareRemovedScope(
    forState,
    itemInstance.scope
  );

  const transaction = forState._transaction;
  if (transaction) {
    (transaction.removedScopes ??= []).push(itemInstance.scope);
    return;
  }

  try {
    disposeChildScope(itemInstance.scope);
  } catch (err) {
    if (isDevelopmentEnvironment()) {
      console.error('[For] Cleanup error:', err);
    }
  }

  if (!removedDom && !removedRange) {
    return;
  }

  if (domCleanup === 'teardown')
    getRuntimeScopes().teardownScopeHost(removedDom, undefined);

  recordRemovedBoundary(forState, removedDom, removedRange);
}

export function createItemInstance<T>(
  key: string | number,
  item: T,
  index: number,
  forState: ForState<T>
): ForItemInstance<T> {
  if (BENCH_BUILD_ENABLED) {
    recordBenchEvent('itemCreated');
  }

  // Create index signal manually without going through state() hook
  // to avoid hook order violations (each For item creates its signal dynamically)
  const indexSignal = createForIndexSignal(index);
  const reactiveItemState = canProxyForItem(item)
    ? createReactiveForItem(item)
    : null;
  const reactiveItem = reactiveItemState?.proxy ?? item;
  const scope = createForOwnedChildScope(forState, key);
  scope.blueprintOwner = forState;

  try {
    renderItemScope(forState, scope, reactiveItem, indexSignal, key);
  } catch (error) {
    // createChildScope registers ownership before rendering. A render failure
    // must not retain a provisional child in the parent owner graph.
    disposeChildScope(scope);
    throw error;
  }

  return {
    key,
    item,
    reactiveItem,
    reactiveItemState,
    indexSignal,
    scope,
  };
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

export function refreshForContextScopes<T>(forState: ForState<T>): void {
  for (const itemInstance of forState.items.values()) {
    captureForItemTransactionSnapshot(forState, itemInstance);
    rerenderItemInstance(forState, itemInstance, itemInstance.reactiveItem);
  }
}

export function updateItemInstance<T>(
  forState: ForState<T>,
  itemInstance: ForItemInstance<T>,
  item: T
): boolean {
  if (itemInstance.item === item) {
    return false;
  }

  captureForItemTransactionSnapshot(forState, itemInstance);

  const previousItem = itemInstance.item;
  itemInstance.item = item;

  const scope = itemInstance.scope;
  let scopeReadsChangedSignal = false;
  const reactiveItemState = itemInstance.reactiveItemState;
  if (!reactiveItemState) {
    rerenderItemInstance(forState, itemInstance, item);
    return true;
  }
  const itemSignal = reactiveItemState.itemSignal;
  reactiveItemState.currentItem = item;

  const propertySignals = reactiveItemState.propertySignals;
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

  if (itemSignal && scopeReadsSource(scope, itemSignal)) {
    scopeReadsChangedSignal = true;
  }

  let coalescedPropertyChanged = false;
  const coalescedProperties = reactiveItemState.coalescedProperties;
  if (coalescedProperties !== null) {
    if (Array.isArray(coalescedProperties)) {
      for (const property of coalescedProperties) {
        if (
          !Object.is(
            readForItemProperty(previousItem, property),
            readForItemProperty(item, property)
          )
        ) {
          coalescedPropertyChanged = true;
          break;
        }
      }
    } else {
      coalescedPropertyChanged = !Object.is(
        readForItemProperty(previousItem, coalescedProperties),
        readForItemProperty(item, coalescedProperties)
      );
      const secondProperty = reactiveItemState.coalescedProperty2;
      if (secondProperty !== null && !coalescedPropertyChanged) {
        coalescedPropertyChanged = !Object.is(
          readForItemProperty(previousItem, secondProperty),
          readForItemProperty(item, secondProperty)
        );
      }
    }
  }
  const wholeItemChanged =
    itemSignal?._hasBeenRead === true &&
    (reactiveItemState.wholeItemRead || coalescedPropertyChanged);
  const itemShapeChanged =
    !wholeItemChanged &&
    changedPropertySignals.length === 0 &&
    !haveSameOwnKeys(previousItem, item);
  const notifyReaders =
    !scopeReadsChangedSignal &&
    (changedPropertySignals.length > 0 || itemShapeChanged || wholeItemChanged);
  const visibleChange =
    scopeReadsChangedSignal ||
    changedPropertySignals.length > 0 ||
    itemShapeChanged ||
    wholeItemChanged;
  for (const [propertySignal, nextValue] of changedPropertySignals) {
    if (
      stageForSignalEffect(
        forState,
        propertySignal,
        notifyReaders,
        null,
        itemInstance.scope.componentInstance
      )
    ) {
      propertySignal.set(nextValue, false);
    } else {
      removeForParentReaders(forState.parentInstance, propertySignal);
      propertySignal.set(nextValue, notifyReaders);
    }
  }
  if (
    itemSignal &&
    stageForSignalEffect(
      forState,
      itemSignal,
      notifyReaders,
      null,
      itemInstance.scope.componentInstance
    )
  ) {
    itemSignal.set(item, false);
  } else if (itemSignal) {
    removeForParentReaders(forState.parentInstance, itemSignal);
    itemSignal.set(item, notifyReaders);
  }

  if (scopeReadsChangedSignal) {
    const scopeReadsDirectly =
      (itemSignal !== null && scopeDirectlyReadsSource(scope, itemSignal)) ||
      changedPropertySignals.some(([propertySignal]) =>
        scopeDirectlyReadsSource(scope, propertySignal)
      );
    if (scopeReadsDirectly) {
      rerenderItemInstance(forState, itemInstance, itemInstance.reactiveItem);
    } else {
      scope.markDirty();
    }
  }

  return visibleChange;
}

const FOR_FALLBACK_SCOPE_KEY = '__for-fallback__';

export function disposeFallbackScope<T>(
  forState: ForState<T>,
  domCleanup: RemovedDomCleanupMode
): void {
  const fallbackScope = forState.fallbackScope;
  if (!fallbackScope) {
    return;
  }

  const { dom: removedDom, range: removedRange } = prepareRemovedScope(
    forState,
    fallbackScope
  );
  const transaction = forState._transaction;
  if (transaction) {
    (transaction.removedScopes ??= []).push(fallbackScope);
  } else {
    disposeChildScope(fallbackScope);
  }
  forState.fallbackScope = null;

  if (!removedDom && !removedRange) {
    return;
  }

  if (domCleanup === 'teardown')
    getRuntimeScopes().teardownScopeHost(removedDom, undefined);

  if (!transaction) recordRemovedBoundary(forState, removedDom, removedRange);
}

export function renderFallbackScope<T>(forState: ForState<T>): VNode[] {
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
    createForOwnedChildScope(forState, FOR_FALLBACK_SCOPE_KEY);
  if (!forState.fallbackScope) {
    forStatesByScope.set(fallbackScope, forState as ForState<unknown>);
  }
  forState.fallbackScope = fallbackScope;

  captureForFallbackTransactionSnapshot(forState, fallbackScope);
  const fallbackVNode = forState.fallback as VNode;
  const vnode = fallbackScope.render(() => fallbackVNode);
  forState.orderedVNodes = vnode == null || vnode === false ? [] : [vnode];
  forState.orderedItems = [];
  return forState.orderedVNodes;
}

export function disposeAllItems<T>(
  forState: ForState<T>,
  domCleanup: RemovedDomCleanupMode
): void {
  const { items, orderedKeys } = forState;
  const preservesCollections =
    forState._transaction?.collectionSnapshotMode === 'preserve-clear';
  if (preservesCollections) {
    const transaction = forState._transaction!;
    transaction.removeAllItems = true;
    if (BENCH_BUILD_ENABLED) {
      recordBenchEvent('itemRemoved', orderedKeys.length);
    }
    for (let index = 0; index < forState.orderedItems.length; index++) {
      const scope = forState.orderedItems[index]?.scope;
      if (scope) prepareRemovedScope(forState, scope);
    }
    forState.items = new Map();
    forState.orderedKeys = [];
    return;
  }

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
