/**
 * For primitive runtime
 *
 * Manages For state storage, hook binding, source evaluation,
 * and DOM update state cleanup.
 */

import { type ComponentInstance, getCurrentInstance } from './component';
import { claimHookIndex } from './component';
import type { VNode } from '../common/vnode';
import type { ChildScope } from './child-scope';
import type { ForItemInstance } from './for-scopes';
import type { FineGrainedEffectHandle } from './effect';
import type {
  ForEachSource,
  ForKeySelector,
  ForRenderItem,
} from './for-types';
import { reconcileForItems } from './for-reconcile';

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
  byFn: ForKeySelector<T>;
  renderFn: ForRenderItem<T>;
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
  renderFn: ForRenderItem<T>,
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
  forState._hasResolvedItemDom = forState.orderedKeys.length > 0;
}
