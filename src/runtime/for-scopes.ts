/**
 * For item and fallback child-scope ownership.
 */

import type { DOMElement, VNode } from '../common/vnode';
import { isDevelopmentEnvironment } from '../common/env';
import type { ComponentInstance } from './component';
import {
  createChildScope,
  disposeChildScope,
  type ChildScope,
} from './child-scope';
import {
  canProxyForItem,
  createForIndexSignal,
  createForItemSignal,
  createReactiveForItem,
  haveSameOwnKeys,
  notifyForSignalReaders,
  readForItemProperty,
  removeForParentReaders,
  scopeReadsSource,
  syncForIndexSignal,
  type ForIndexSignal,
  type ForItemPropertySignal,
  type ForItemSignal,
} from './for-signals';
import { getRuntimeRenderer } from './access';
import { recordBenchEvent } from './for-bench';
import type { ForState } from './for-internal';

export interface ForItemInstance<T> {
  key: string | number;
  item: T;
  reactiveItem: T;
  itemSignal: ForItemSignal<T> | null;
  itemPropertySignals: Map<PropertyKey, ForItemPropertySignal> | null;
  indexSignal: ForIndexSignal;
  scope: ChildScope;
}

export type RemovedDomCleanupMode = 'none' | 'teardown' | 'full-clear';

function enqueueForScopeUpdate(parent: ComponentInstance | null): void {
  parent?._enqueueRun?.();
}

export function syncForItemIndex<T>(
  forState: ForState<T>,
  itemInstance: ForItemInstance<T>,
  nextIndex: number
): boolean {
  const indexSignal = itemInstance.indexSignal;
  if (indexSignal.peek() === nextIndex) {
    return false;
  }

  const scopeReadsIndex = scopeReadsSource(itemInstance.scope, indexSignal);
  if (!scopeReadsIndex) {
    syncForIndexSignal(indexSignal, nextIndex);
    return false;
  }

  indexSignal.set(nextIndex, false);
  notifyForSignalReaders(indexSignal, itemInstance.scope.componentInstance);

  rerenderItemInstance(forState, itemInstance, itemInstance.reactiveItem);

  return true;
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

export function disposeItemInstance<T>(
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
      getRuntimeRenderer().teardownNodeSubtree(removedDom);
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

    enqueueForScopeUpdate(forState.parentInstance);
  });

  renderItemScope(forState, scope, reactiveItem, indexSignal, key);

  return {
    key,
    item,
    reactiveItem,
    itemSignal,
    itemPropertySignals,
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

export function updateItemInstance<T>(
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

  const itemShapeChanged =
    changedPropertySignals.length === 0 && !haveSameOwnKeys(previousItem, item);
  const notifyReaders =
    !scopeReadsChangedSignal &&
    (changedPropertySignals.length > 0 || itemShapeChanged);
  const visibleChange =
    scopeReadsChangedSignal ||
    changedPropertySignals.length > 0 ||
    itemShapeChanged;
  for (const [propertySignal, nextValue] of changedPropertySignals) {
    removeForParentReaders(forState.parentInstance, propertySignal);
    propertySignal.set(nextValue, notifyReaders);
  }
  removeForParentReaders(forState.parentInstance, itemSignal);
  itemSignal.set(item, notifyReaders);

  if (scopeReadsChangedSignal) {
    rerenderItemInstance(forState, itemInstance, itemInstance.reactiveItem);
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

  const removedDom = fallbackScope.dom;
  disposeChildScope(fallbackScope);
  forState.fallbackScope = null;

  if (!removedDom) {
    return;
  }

  if (removedDom instanceof Element) {
    if (domCleanup === 'teardown') {
      getRuntimeRenderer().teardownNodeSubtree(removedDom);
    }
  }

  forState.lastRemovedNodes.push(removedDom);
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
    createChildScope(forState.parentInstance, FOR_FALLBACK_SCOPE_KEY, () => {
      if (forState._enqueueBoundaryCommit) {
        forState._enqueueBoundaryCommit();
        return;
      }

      enqueueForScopeUpdate(forState.parentInstance);
    });
  forState.fallbackScope = fallbackScope;

  const vnode = fallbackScope.render(() => forState.fallback as VNode);
  forState.orderedVNodes = vnode == null || vnode === false ? [] : [vnode];
  forState.orderedItems = [];
  return forState.orderedVNodes;
}

export function disposeAllItems<T>(
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
