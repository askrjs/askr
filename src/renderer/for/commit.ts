import { commitForStrategy, isExactRemovedBoundary } from './strategies';
import type { ChildScope } from '../../runtime';
import {
  beginForStateTransaction,
  prepareForCommitPlan,
  captureForFallbackTransactionSnapshot,
  captureForItemTransactionSnapshot,
  clearForDomUpdateState,
  FOR_STRATEGY_TRAITS,
  registerForStateTransaction,
  recordBenchCounter,
  recordBenchEvent,
  recordBenchTiming,
  type ForState,
  withBenchMetricScope,
} from '../../runtime';
import {
  runCommitTransaction,
  registerCommitRollback,
} from '../../runtime/transactions/access';
import { teardownNodeSubtree } from '../ownership/cleanup';
import { keyedElements } from '../reconciliation/keyed';
import type { VNode } from '../types';
import {
  adoptExistingForDom,
  canSyncKeyedMapMutate,
  syncKeyedMapFromForState,
} from './dom-map';
import { replaceChildrenInOrder } from './reorder';
import { removeForBoundaryNodes } from './removal';
import {
  commitForStateBoundaryRanges,
  deferBoundaryNodeFinalization,
  prepareForCommitRanges,
  type ForRangeCommitRuntime,
} from './ranges';

declare const __ASKR_BENCH_BUILD__: boolean;

const BENCH_BUILD_ENABLED = __ASKR_BENCH_BUILD__;

export interface ForCommitRuntime extends ForRangeCommitRuntime {
  isProduction(): boolean;
  tryPatchStableForDirtyItem(scope: ChildScope): boolean;
}

export function commitForStateBoundaryChildren(
  parent: Element,
  forState: ForState<unknown>,
  childrenVNodes: VNode[],
  runtime: ForCommitRuntime
): void {
  const previousChildren = Array.from(parent.childNodes);
  const currentKeyedMap = keyedElements.get(parent);
  const keyedMapMayMutate = canSyncKeyedMapMutate(
    currentKeyedMap,
    forState,
    forState.lastCommitStrategy,
    forState.lastRemovedNodes
  );
  const previousKeyedMap =
    keyedMapMayMutate && currentKeyedMap ? new Map(currentKeyedMap) : undefined;
  runCommitTransaction(() => {
    registerCommitRollback(() => {
      const errors: unknown[] = [];
      const previousChildrenSet = new Set(previousChildren);
      for (const node of Array.from(parent.childNodes)) {
        if (!previousChildrenSet.has(node)) {
          try {
            teardownNodeSubtree(node);
          } catch (error) {
            errors.push(error);
          }
        }
      }
      try {
        parent.replaceChildren(...previousChildren);
      } catch (error) {
        errors.push(error);
      }
      if (keyedMapMayMutate) {
        if (previousKeyedMap) keyedElements.set(parent, previousKeyedMap);
        else keyedElements.delete(parent);
      }
      if (errors.length)
        throw new AggregateError(errors, 'List application restoration failed');
    });
    beginForStateTransaction(forState, 'reuse');
    registerForStateTransaction(forState);
    commitForStateBoundaryChildrenImpl(
      parent,
      forState,
      childrenVNodes,
      runtime
    );
  });
}

/**
 * Commit a list that has become empty.
 *
 * The only thing left to place is the fallback, if the boundary declares one.
 * Whatever the previous rows left behind is either consumed wholesale — when
 * the removed nodes are exactly the parent's children, one `replaceChildren`
 * does it — or removed and deferred for teardown.
 */
function commitEmptyForBoundary(
  parent: Element,
  forState: ForState<unknown>,
  childrenVNodes: VNode[],
  runtime: ForCommitRuntime,
  preResolvedRanges: ReturnType<
    typeof prepareForCommitRanges
  >['preResolvedRanges']
): void {
  const previousBoundaryNodes = Array.from(parent.childNodes);
  const fallbackScope = forState.fallbackScope;
  const fallbackVNode = childrenVNodes[0];
  if (
    fallbackScope &&
    (fallbackScope.needsDomUpdate || fallbackScope.hydrationPending)
  ) {
    captureForFallbackTransactionSnapshot(forState, fallbackScope);
  }
  const fallbackRange =
    fallbackScope && fallbackVNode !== undefined
      ? preResolvedRanges.has(fallbackScope)
        ? (preResolvedRanges.get(fallbackScope) ?? null)
        : runtime.syncForItemRange(parent, fallbackScope, fallbackVNode)
      : null;
  const nextDom = fallbackRange?.single ? fallbackRange.start : null;

  let removedBoundaryConsumed = false;
  if (nextDom && isExactRemovedBoundary(parent, forState.lastRemovedNodes)) {
    recordBenchEvent('domRemove', forState.lastRemovedNodes.length);
    parent.replaceChildren(nextDom);
    removedBoundaryConsumed = true;
  } else {
    removeForBoundaryNodes(parent, forState.lastRemovedNodes, {
      teardown: false,
    });
  }

  if (nextDom) {
    if (
      parent.childNodes.length !== 1 ||
      parent.firstChild !== nextDom ||
      (forState.lastRemovedNodes.length > 0 && !removedBoundaryConsumed)
    ) {
      parent.replaceChildren(nextDom);
    }
  } else if (parent.firstChild) {
    parent.textContent = '';
  }

  const retainedBoundaryNodes = new Set(parent.childNodes);
  deferBoundaryNodeFinalization(
    previousBoundaryNodes.filter((node) => !retainedBoundaryNodes.has(node)),
    forState
  );

  keyedElements.delete(parent);
  forState._hasResolvedItemDom = false;
}

/** Close out a commit: record its cost and drop the pending DOM-update state. */
function finishForCommit(
  forState: ForState<unknown>,
  domCommitStart: number
): void {
  if (BENCH_BUILD_ENABLED) {
    recordBenchTiming('domCommit', performance.now() - domCommitStart);
  }
  clearForDomUpdateState(forState);
}

/**
 * Force the parent's children to match the list exactly.
 *
 * The strategies report whether they left the boundary exact; when one cannot
 * promise that, this rebuilds the expected order and hands anything displaced
 * to deferred teardown. It resolves each item's DOM the same way the strategies
 * do, so an item that never got a node during the commit gets one here.
 */
function syncExactForBoundaryChildren(
  parent: Element,
  forState: ForState<unknown>,
  childrenVNodes: VNode[],
  syncItemDom: (
    item: (typeof forState.orderedItems)[number],
    vnode: VNode
  ) => Node | null
): void {
  const expectedNodes: Node[] = [];

  for (let i = 0; i < forState.orderedKeys.length; i++) {
    const itemInstance = forState.orderedItems[i];
    if (!itemInstance) {
      continue;
    }

    const dom =
      itemInstance.scope.dom && !itemInstance.scope.needsDomUpdate
        ? itemInstance.scope.dom
        : syncItemDom(itemInstance, childrenVNodes[i]);
    if (dom) {
      expectedNodes.push(dom);
    }
  }

  const currentNodes = Array.from(parent.childNodes);
  if (
    currentNodes.length === expectedNodes.length &&
    currentNodes.every((node, index) => node === expectedNodes[index])
  ) {
    return;
  }

  const expectedNodeSet = new Set(expectedNodes);
  const displacedNodes: Node[] = [];
  for (const currentNode of currentNodes) {
    if (expectedNodeSet.has(currentNode)) {
      continue;
    }

    if (currentNode.parentNode === parent) {
      recordBenchEvent('domRemove');
      currentNode.remove();
    }
    displacedNodes.push(currentNode);
  }

  replaceChildrenInOrder(parent, expectedNodes, true);
  deferBoundaryNodeFinalization(displacedNodes, forState);
}

function commitForStateBoundaryChildrenImpl(
  parent: Element,
  forState: ForState<unknown>,
  childrenVNodes: VNode[],
  runtime: ForCommitRuntime
): void {
  const domCommitStart = BENCH_BUILD_ENABLED ? performance.now() : 0;
  const { needsAnchoredRanges, preResolvedRanges, previousRanges } =
    BENCH_BUILD_ENABLED &&
    (forState.lastCommitStrategy === 'APPEND' ||
      forState.lastCommitStrategy === 'FULL_KEYED')
      ? withBenchMetricScope('coldCreate', () =>
          prepareForCommitRanges(parent, forState, childrenVNodes, runtime)
        )
      : prepareForCommitRanges(parent, forState, childrenVNodes, runtime);
  if (needsAnchoredRanges) {
    commitForStateBoundaryRanges(
      parent,
      forState,
      childrenVNodes,
      runtime,
      preResolvedRanges,
      previousRanges
    );
    // Anchored ranges own their own pending state, so this exit records the
    // cost without clearing it the way finishForCommit would.
    if (BENCH_BUILD_ENABLED) {
      recordBenchTiming('domCommit', performance.now() - domCommitStart);
    }
    return;
  }
  let removedBoundaryConsumed = false;

  const captureItemBeforeCommit = (
    item: (typeof forState.orderedItems)[number]
  ): void => {
    if (item.scope.needsDomUpdate || item.scope.hydrationPending) {
      captureForItemTransactionSnapshot(forState, item);
    }
  };

  const syncItemDom = (
    item: (typeof forState.orderedItems)[number],
    vnode: VNode
  ): Node | null => {
    if (BENCH_BUILD_ENABLED) {
      recordBenchCounter('itemDomSyncCalls');
    }
    captureItemBeforeCommit(item);
    const range = preResolvedRanges.has(item.scope)
      ? (preResolvedRanges.get(item.scope) ?? null)
      : runtime.syncForItemRange(parent, item.scope, vnode);
    return range?.single ? range.start : null;
  };

  if (forState.orderedKeys.length === 0) {
    commitEmptyForBoundary(
      parent,
      forState,
      childrenVNodes,
      runtime,
      preResolvedRanges
    );
    finishForCommit(forState, domCommitStart);
    return;
  }

  if (!forState._hasResolvedItemDom && parent.childNodes.length > 0) {
    adoptExistingForDom(parent, forState);
  }

  const getDirtyForIndices = (): number[] => {
    const pendingDirtyIndices = forState.pendingDirtyIndices;
    if (pendingDirtyIndices !== null) {
      return pendingDirtyIndices;
    }

    const dirtyIndices: number[] = [];
    for (let index = 0; index < forState.orderedKeys.length; index += 1) {
      const itemInstance = forState.orderedItems[index];
      if (itemInstance?.scope.needsDomUpdate) {
        dirtyIndices.push(index);
      }
    }

    return dirtyIndices;
  };

  let dirtyIndicesCache: number[] | null = null;
  const ensureDirtyIndices = (): number[] => {
    if (dirtyIndicesCache) {
      return dirtyIndicesCache;
    }

    dirtyIndicesCache = getDirtyForIndices();
    return dirtyIndicesCache;
  };

  const dirtyIndices = FOR_STRATEGY_TRAITS[forState.lastCommitStrategy]
    .needsDirtyIndices
    ? ensureDirtyIndices()
    : [];
  let boundaryChildrenExact = false;

  const applyStrategy = (
    strategy: Parameters<typeof prepareForCommitPlan>[3]
  ): void => {
    const result = commitForStrategy(
      prepareForCommitPlan(forState, childrenVNodes, dirtyIndices, strategy),
      {
        parent,
        runtime,
        preResolvedRanges,
        captureItemBeforeCommit,
        syncItemDom,
      }
    );
    boundaryChildrenExact = result.boundaryChildrenExact;
    removedBoundaryConsumed ||= result.removedBoundaryConsumed;
  };

  const isLocalOnlyDirtyCommit =
    forState.lastCommitStrategy === 'NO_REORDER' &&
    dirtyIndices.length > 0 &&
    forState.pendingDirtyIndices === null &&
    forState.pendingSwapIndices === null &&
    !forState.pendingMoveOnly &&
    forState.lastRemovedNodes.length === 0 &&
    parent.childNodes.length === forState.orderedKeys.length;

  if (isLocalOnlyDirtyCommit) {
    applyStrategy('NO_REORDER');
    syncKeyedMapFromForState(parent, forState, 'NO_REORDER', []);
    finishForCommit(forState, domCommitStart);
    return;
  }

  if (forState.lastCommitStrategy === 'REMOVE_ONE') {
    // Physically remove the node for the removed key first: commitDirtyNoReorder
    // anchors dirty items via `parent.childNodes[i]`, and `i` is the item's
    // POST-removal index. Computing that anchor while the removed node is
    // still attached reads the wrong sibling for every dirty index at or
    // after the removed slot, which can silently reorder unrelated rows.
    removeForBoundaryNodes(parent, forState.lastRemovedNodes, {
      teardown: false,
    });
    removedBoundaryConsumed = true;
  }

  applyStrategy(FOR_STRATEGY_TRAITS[forState.lastCommitStrategy].planKind);

  if (!removedBoundaryConsumed) {
    removeForBoundaryNodes(parent, forState.lastRemovedNodes, {
      teardown: false,
    });
  }
  syncKeyedMapFromForState(
    parent,
    forState,
    forState.lastCommitStrategy,
    forState.lastRemovedNodes
  );

  if (!boundaryChildrenExact) {
    syncExactForBoundaryChildren(parent, forState, childrenVNodes, syncItemDom);
  }
  forState._hasResolvedItemDom = true;
  finishForCommit(forState, domCommitStart);
}
