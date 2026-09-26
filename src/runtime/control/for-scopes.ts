/**
 * For item and fallback child-scope ownership.
 */

import type { DOMElement, VNode } from '../../common/vnode';
import type { DOMRange } from '../../common/dom-range';
import { reportUncaughtErrorLater } from '../../common/report-error';
import { type ComponentInstance } from '../component/instance';
import { bindControlScopeErrorOwner } from '../component/error-boundary';
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
import { peekLatestRenderToken } from '../component/scope';
import { recordBenchCounter, recordBenchEvent } from '../diagnostics/for-bench';
import type { ForItemTransactionSnapshot, ForState } from './for-state';
import type { ReadableSource } from '../reactivity/readable';
import type { ForRenderItem } from './for-types';

declare const __ASKR_BENCH_BUILD__: boolean;

const BENCH_BUILD_ENABLED = __ASKR_BENCH_BUILD__;

export interface ForItemInstance<T> {
  key: string | number;
  item: T;
  reactiveItem: T;
  reactiveItemState: ReactiveForItemState<T> | null;
  indexSignal: ForIndexSignal;
  scope: ChildScope;
  /** Row callback that produced the scope's current output. */
  renderedWith: ForRenderItem<T> | null;
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
    forState._scopeOwnership,
    forState._sourceEffect
  );
  bindControlScopeErrorOwner(scope.componentInstance, forState);
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
    renderedWith: itemInstance.renderedWith,
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
  skipOwnedBy: ComponentInstance | null = null,
  skipOwnedRenderedAfter: number | null = null
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
      existing.skipOwnedRenderedAfter = null;
    } else if (
      existing.skipOwnedRenderedAfter !== null &&
      skipOwnedRenderedAfter !== null
    ) {
      // Only a render after the latest change has read the final value.
      existing.skipOwnedRenderedAfter = Math.max(
        existing.skipOwnedRenderedAfter,
        skipOwnedRenderedAfter
      );
    } else {
      existing.skipOwnedRenderedAfter ??= skipOwnedRenderedAfter;
    }
  } else {
    effects.set(source, {
      parentInstance: forState.parentInstance,
      notify,
      skipInstance,
      skipOwnedBy,
      skipOwnedRenderedAfter,
    });
  }
  return true;
}

/** The row does not show the index change. */
const INDEX_NOT_VISIBLE = 0;
/** The row shows the index change and was marked dirty. */
const INDEX_MARKED_DIRTY = 1;
/** The row reads the index in its own scope and must rerun. */
const INDEX_NEEDS_RERUN = 2;

type IndexSyncResult =
  | typeof INDEX_NOT_VISIBLE
  | typeof INDEX_MARKED_DIRTY
  | typeof INDEX_NEEDS_RERUN;

/**
 * Move the row's index signal to `nextIndex` and notify or stage its other
 * readers. The caller reruns the row when this returns `INDEX_NEEDS_RERUN`, so
 * an item change in the same pass can share that run.
 */
function applyForItemIndex<T>(
  forState: ForState<T>,
  itemInstance: ForItemInstance<T>,
  nextIndex: number
): IndexSyncResult {
  const indexSignal = itemInstance.indexSignal;
  const previousIndex = indexSignal.peek();
  if (previousIndex === nextIndex) {
    return INDEX_NOT_VISIBLE;
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
    return INDEX_NOT_VISIBLE;
  }

  captureForItemTransactionSnapshot(forState, itemInstance);

  const scopeReadsIndex = scopeReadsSource(itemInstance.scope, indexSignal);
  if (forState._transaction) {
    const shouldNotify = indexSignal._hasBeenRead === true;
    indexSignal.set(nextIndex, false);
    // Readers inside the row that render after this point (because the row
    // reruns or is recommitted) already read the new index; notifying them
    // again would render them twice. Owned readers that do not render again,
    // such as a nested For row with a stable callback, are still notified.
    const rowInstance = scopeReadsIndex
      ? itemInstance.scope.componentInstance
      : null;
    stageForSignalEffect(
      forState,
      indexSignal,
      shouldNotify,
      rowInstance,
      rowInstance,
      rowInstance ? peekLatestRenderToken() : null
    );
    if (!scopeReadsIndex) {
      return INDEX_NOT_VISIBLE;
    }

    if (scopeDirectlyReadsSource(itemInstance.scope, indexSignal)) {
      return INDEX_NEEDS_RERUN;
    }
    itemInstance.scope.markDirty();
    return INDEX_MARKED_DIRTY;
  }

  if (!scopeReadsIndex) {
    syncForIndexSignal(indexSignal, nextIndex);
    return INDEX_NOT_VISIBLE;
  }

  indexSignal.set(nextIndex, false);
  notifyForSignalReaders(indexSignal, itemInstance.scope.componentInstance);
  return INDEX_NEEDS_RERUN;
}

export function syncForItemIndex<T>(
  forState: ForState<T>,
  itemInstance: ForItemInstance<T>,
  nextIndex: number
): boolean {
  const result = applyForItemIndex(forState, itemInstance, nextIndex);
  if (result === INDEX_NEEDS_RERUN) {
    rerenderItemInstance(forState, itemInstance, currentRowItem(itemInstance));
  }
  return result !== INDEX_NOT_VISIBLE;
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
  itemInstance: ForItemInstance<T>,
  item: T
): VNode {
  if (BENCH_BUILD_ENABLED) {
    recordBenchEvent('rowFactory');
  }
  const { scope, indexSignal, key } = itemInstance;
  // The scope reruns this closure on its own when a value it read changes.
  // Read the latest callback and key the vnode on every run, so a self rerun
  // neither uses a stale closure nor drops the key that ties the row's
  // component instances to it.
  return scope.render(() => {
    const renderFn = forState.renderFn;
    itemInstance.renderedWith = renderFn;
    const vnode = renderFn(item, indexSignal);
    materializeItemVnode(forState, key, vnode);
    return vnode;
  });
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
    reportUncaughtErrorLater(err);
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
  const itemInstance: ForItemInstance<T> = {
    key,
    item,
    reactiveItem,
    reactiveItemState,
    indexSignal,
    scope,
    renderedWith: null,
  };

  try {
    renderItemScope(forState, itemInstance, reactiveItem);
  } catch (error) {
    // createChildScope registers ownership before rendering. A render failure
    // must not retain a provisional child in the parent owner graph.
    disposeChildScope(scope);
    throw error;
  }

  return itemInstance;
}

function rerenderItemInstance<T>(
  forState: ForState<T>,
  itemInstance: ForItemInstance<T>,
  item: T
): void {
  renderItemScope(forState, itemInstance, item);
}

/**
 * The value a row renders with. Object items render through their proxy, which
 * always reads the current item. A plain item (a primitive, null, or an array)
 * is passed by value, so only `item` holds its latest version. That includes a
 * row created with an object whose item later became plain.
 */
function currentRowItem<T>(itemInstance: ForItemInstance<T>): T {
  return itemInstance.reactiveItemState && canProxyForItem(itemInstance.item)
    ? itemInstance.reactiveItem
    : itemInstance.item;
}

/**
 * Whether a retained row's output predates this pass: it came from an earlier
 * row callback, or the For's context frame changed. Only meaningful while
 * `reconcileForItems` runs.
 */
function hasStaleRowOutput<T>(
  forState: ForState<T>,
  itemInstance: ForItemInstance<T>
): boolean {
  return (
    forState._contextFrameChanged ||
    itemInstance.renderedWith !== forState.renderFn
  );
}

/**
 * Whether the reconcile path will rerun this retained row anyway, with its
 * latest item, index, and callback. Every path calls `updateItemInstance` for a
 * retained row whose item changed, which reruns a stale row, and
 * `syncForItemIndex` for a retained row whose index changed, which reruns a row
 * that reads its index in its own scope.
 */
function rowRerunsDuringReconcile<T>(
  itemInstance: ForItemInstance<T>,
  nextItem: T,
  nextIndex: number
): boolean {
  if (itemInstance.item !== nextItem) {
    return true;
  }
  const indexSignal = itemInstance.indexSignal;
  return (
    indexSignal._hasBeenRead === true &&
    indexSignal.peek() !== nextIndex &&
    scopeDirectlyReadsSource(itemInstance.scope, indexSignal)
  );
}

/**
 * Rerender retained rows whose output is stale: it came from an earlier row
 * callback, or the context frame changed (`contextChanged`). The parent passes
 * a fresh closure on every render, so values it captured (such as a `const`
 * derived from state) reach existing rows without remounting them.
 *
 * Rows about to be removed and rows created in this pass are skipped. So are
 * rows the reconcile path reruns anyway, so a refresh never adds a second run.
 */
export function refreshForRowRenderers<T>(
  forState: ForState<T>,
  newArray: readonly T[],
  keys: readonly (string | number)[],
  contextChanged: boolean
): void {
  const { items, renderFn } = forState;
  for (let index = 0; index < keys.length; index++) {
    const itemInstance = items.get(keys[index]);
    if (
      !itemInstance ||
      (!contextChanged && itemInstance.renderedWith === renderFn) ||
      rowRerunsDuringReconcile(itemInstance, newArray[index], index)
    ) {
      continue;
    }
    captureForItemTransactionSnapshot(forState, itemInstance);
    rerenderItemInstance(forState, itemInstance, currentRowItem(itemInstance));
  }
}

/**
 * Apply a new item to a retained row. Pass `nextIndex` when the row also moves
 * in this pass: the index is applied here too, so a row that shows both
 * changes reruns once, with its latest item and index.
 */
export function updateItemInstance<T>(
  forState: ForState<T>,
  itemInstance: ForItemInstance<T>,
  item: T,
  nextIndex?: number
): boolean {
  if (itemInstance.item === item) {
    return nextIndex === undefined
      ? false
      : syncForItemIndex(forState, itemInstance, nextIndex);
  }

  captureForItemTransactionSnapshot(forState, itemInstance);

  const previousItem = itemInstance.item;
  itemInstance.item = item;

  const scope = itemInstance.scope;
  let scopeReadsChangedSignal = false;
  const reactiveItemState = itemInstance.reactiveItemState;
  // A plain item cannot go through the proxy, even in a row created with an
  // object. The row renders it as a value until it becomes an object again.
  if (!reactiveItemState || !canProxyForItem(item)) {
    if (nextIndex !== undefined) {
      applyForItemIndex(forState, itemInstance, nextIndex);
    }
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

  const indexResult =
    nextIndex === undefined
      ? INDEX_NOT_VISIBLE
      : applyForItemIndex(forState, itemInstance, nextIndex);

  // `refreshForRowRenderers` leaves a stale row with a changed item to this
  // call, so it reruns here once, after the proxy sees the new item.
  // A row that rendered a plain item did not read the proxy, so no property
  // signal tells it the object is back.
  const staleOutput =
    hasStaleRowOutput(forState, itemInstance) || !canProxyForItem(previousItem);
  if (
    staleOutput ||
    indexResult === INDEX_NEEDS_RERUN ||
    (scopeReadsChangedSignal &&
      ((itemSignal !== null && scopeDirectlyReadsSource(scope, itemSignal)) ||
        changedPropertySignals.some(([propertySignal]) =>
          scopeDirectlyReadsSource(scope, propertySignal)
        )))
  ) {
    rerenderItemInstance(forState, itemInstance, itemInstance.reactiveItem);
  } else if (scopeReadsChangedSignal) {
    scope.markDirty();
  }

  return visibleChange || staleOutput || indexResult !== INDEX_NOT_VISIBLE;
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
