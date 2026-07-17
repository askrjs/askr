import type { ChildScope } from '../runtime';
import type { DOMRange } from '../common/dom-range';
import {
  beginForStateTransaction,
  captureForFallbackTransactionSnapshot,
  captureForItemTransactionSnapshot,
  clearForDomUpdateState,
  registerForStateTransaction,
  rollbackForStateTransaction,
  recordBenchCounter,
  recordBenchEvent,
  recordBenchTiming,
  type ForState,
  withBenchMetricScope,
} from '../runtime';
import {
  beginLifecycleCommitBatch,
  discardLifecycleCommitBatch,
  flushLifecycleCommitBatch,
} from '../runtime';
import { teardownNodeSubtree } from './cleanup';
import { keyedElements } from './keyed';
import type { VNode } from './types';
import { canUseDirectReplaceChildrenSpread } from './utils';
import {
  getOrBuildDomKeyMap,
  hydrateExistingForDomInOrder,
  syncKeyedMapFromForState,
} from './for-commit-dom-map';
import {
  commitMoveOnlyReorder,
  replaceChildrenInOrder,
} from './for-commit-reorder';
import { removeForBoundaryNodes } from './for-commit-removal';
import { getRangeNodes, moveRange } from './dom-range';
import { isFragment } from './evaluate-reconcile';

declare const __ASKR_BENCH_BUILD__: boolean;

const BENCH_BUILD_ENABLED = __ASKR_BENCH_BUILD__;

function isExactRemovedBoundary(
  parent: Element,
  removedNodes: Node[]
): boolean {
  if (
    removedNodes.length === 0 ||
    removedNodes.length !== parent.childNodes.length
  ) {
    return false;
  }

  for (let index = 0; index < removedNodes.length; index++) {
    if (removedNodes[index] !== parent.childNodes[index]) {
      return false;
    }
  }

  return true;
}

export interface ForCommitRuntime {
  isProduction(): boolean;
  syncForItemDom(parent: Element, scope: ChildScope, vnode: VNode): Node | null;
  tryPatchStableForDirtyItem(scope: ChildScope): boolean;
}

function isMultiNodeVNode(vnode: VNode): boolean {
  if (vnode === null || vnode === undefined || vnode === false) {
    return true;
  }
  return (
    Array.isArray(vnode) ||
    (typeof vnode === 'object' && vnode !== null && isFragment(vnode))
  );
}

function getScopeRange(scope: ChildScope, node: Node | null): DOMRange | null {
  if (scope.range) {
    return scope.range;
  }
  if (!node) {
    return null;
  }
  return { start: node, end: node, single: true };
}

function detachRange(range: DOMRange): void {
  const parent = range.start.parentNode;
  if (!parent) return;
  const fragment = parent.ownerDocument?.createDocumentFragment();
  if (fragment) {
    moveRange(fragment, range);
  }
}

function detachRemovedForNodes(
  parent: Element,
  forState: ForState<unknown>
): void {
  for (const range of forState.lastRemovedRanges) {
    detachRange(range);
  }
  for (const node of forState.lastRemovedNodes) {
    if (node.parentNode === parent) {
      node.parentNode.removeChild(node);
    }
  }
}

function commitForStateBoundaryRanges(
  parent: Element,
  forState: ForState<unknown>,
  childrenVNodes: VNode[],
  runtime: ForCommitRuntime
): void {
  const desiredRanges: DOMRange[] = [];

  if (forState.orderedKeys.length === 0) {
    const fallbackScope = forState.fallbackScope;
    const fallbackVNode = childrenVNodes[0];
    if (fallbackScope && fallbackVNode !== undefined) {
      const node = !fallbackScope.needsDomUpdate
        ? null
        : runtime.syncForItemDom(parent, fallbackScope, fallbackVNode);
      const range = getScopeRange(fallbackScope, node);
      if (range) desiredRanges.push(range);
    }
  } else {
    for (let index = 0; index < forState.orderedItems.length; index += 1) {
      const item = forState.orderedItems[index];
      if (!item) continue;
      captureItemBeforeRangeCommit(forState, item);
      const node = !item.scope.needsDomUpdate
        ? null
        : runtime.syncForItemDom(parent, item.scope, childrenVNodes[index]);
      const range = getScopeRange(item.scope, node);
      if (range) desiredRanges.push(range);
    }
  }

  const desiredNodes = new Set<Node>();
  for (const range of desiredRanges) {
    desiredNodes.add(range.start);
    for (const node of getRangeNodes(range)) desiredNodes.add(node);
    if (!range.single) desiredNodes.add(range.end);
  }

  detachRemovedForNodes(parent, forState);

  let anchor: Node | null = null;
  for (let index = desiredRanges.length - 1; index >= 0; index -= 1) {
    const range = desiredRanges[index]!;
    moveRange(parent, range, anchor);
    anchor = range.start;
  }

  for (const node of Array.from(parent.childNodes)) {
    if (desiredNodes.has(node)) continue;
    node.parentNode?.removeChild(node);
  }

  forState._hasResolvedItemDom = true;
  clearForDomUpdateState(forState);
}

function captureItemBeforeRangeCommit(
  forState: ForState<unknown>,
  item: (typeof forState.orderedItems)[number]
): void {
  if (item.scope.needsDomUpdate || item.scope.hydrationPending) {
    captureForItemTransactionSnapshot(forState, item);
  }
}

export function commitForStateBoundaryChildren(
  parent: Element,
  forState: ForState<unknown>,
  childrenVNodes: VNode[],
  runtime: ForCommitRuntime
): void {
  const previousChildren = Array.from(parent.childNodes);
  const currentKeyedMap = keyedElements.get(parent);
  const previousKeyedMap = currentKeyedMap
    ? new Map(currentKeyedMap)
    : undefined;
  const lifecycleBatch = beginLifecycleCommitBatch();
  // A commit-only transaction does not reconcile collection membership. Keep
  // the committed collections by reference and snapshot only scopes that the
  // DOM phase is about to mutate.
  beginForStateTransaction(forState, 'reuse');
  registerForStateTransaction(forState);
  try {
    commitForStateBoundaryChildrenImpl(
      parent,
      forState,
      childrenVNodes,
      runtime
    );
    flushLifecycleCommitBatch(lifecycleBatch);
  } catch (error) {
    discardLifecycleCommitBatch(lifecycleBatch);
    rollbackForStateTransaction(forState);

    const previousChildrenSet = new Set(previousChildren);
    for (const node of Array.from(parent.childNodes)) {
      if (!previousChildrenSet.has(node)) {
        teardownNodeSubtree(node);
      }
    }
    parent.replaceChildren(...previousChildren);
    if (previousKeyedMap) {
      keyedElements.set(parent, new Map(previousKeyedMap));
    } else {
      keyedElements.delete(parent);
    }
    throw error;
  }
}

function commitForStateBoundaryChildrenImpl(
  parent: Element,
  forState: ForState<unknown>,
  childrenVNodes: VNode[],
  runtime: ForCommitRuntime
): void {
  const domCommitStart = BENCH_BUILD_ENABLED ? performance.now() : 0;

  const needsAnchoredRanges =
    childrenVNodes.some(isMultiNodeVNode) ||
    forState.orderedItems.some(
      (item) => item.scope.range && !item.scope.range.single
    ) ||
    Boolean(
      forState.fallbackScope?.range && !forState.fallbackScope.range.single
    );
  if (needsAnchoredRanges) {
    commitForStateBoundaryRanges(parent, forState, childrenVNodes, runtime);
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
    captureItemBeforeCommit(item);
    return runtime.syncForItemDom(parent, item.scope, vnode);
  };

  const hydrateExistingForDom = (): void => {
    if (parent.children.length === forState.orderedKeys.length) {
      for (let index = 0; index < forState.orderedItems.length; index++) {
        const item = forState.orderedItems[index];
        if (item) {
          captureForItemTransactionSnapshot(forState, item);
        }
      }
    }

    if (hydrateExistingForDomInOrder(parent, forState)) {
      return;
    }

    const domKeyMap = getOrBuildDomKeyMap(parent);
    if (!domKeyMap) {
      return;
    }

    for (let i = 0; i < forState.orderedKeys.length; i++) {
      const itemKey = forState.orderedKeys[i];
      const itemInstance = forState.items.get(itemKey);
      if (!itemInstance || itemInstance.scope.dom) {
        continue;
      }

      const existingDom = domKeyMap.get(itemKey);
      if (!existingDom) {
        continue;
      }

      captureForItemTransactionSnapshot(forState, itemInstance);
      itemInstance.scope.dom = existingDom;
      itemInstance.scope.needsDomUpdate = true;
    }
  };

  if (forState.orderedKeys.length === 0) {
    const fallbackScope = forState.fallbackScope;
    const fallbackVNode = childrenVNodes[0];
    if (
      fallbackScope &&
      (fallbackScope.needsDomUpdate || fallbackScope.hydrationPending)
    ) {
      captureForFallbackTransactionSnapshot(forState, fallbackScope);
    }
    const nextDom =
      fallbackScope && fallbackVNode !== undefined
        ? runtime.syncForItemDom(parent, fallbackScope, fallbackVNode)
        : null;

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

    keyedElements.delete(parent);
    forState._hasResolvedItemDom = false;
    if (BENCH_BUILD_ENABLED) {
      recordBenchTiming('domCommit', performance.now() - domCommitStart);
    }
    clearForDomUpdateState(forState);
    return;
  }

  if (!forState._hasResolvedItemDom && parent.childNodes.length > 0) {
    hydrateExistingForDom();
  }

  const getDirtyForIndices = (): number[] => {
    const pendingDirtyIndices = forState.pendingDirtyIndices;
    if (pendingDirtyIndices && pendingDirtyIndices.length > 0) {
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

  const dirtyIndices =
    forState.lastCommitStrategy === 'NO_REORDER' ||
    forState.lastCommitStrategy === 'REMOVE_ONE'
      ? ensureDirtyIndices()
      : [];
  let boundaryChildrenExact = false;

  const commitDirtyNoReorder = (dirtyIndices: number[]): void => {
    if (dirtyIndices.length === 0) {
      boundaryChildrenExact = true;
      return;
    }

    const orderedItems = forState.orderedItems;
    const childNodes = parent.childNodes;

    for (let dirtyIndex = 0; dirtyIndex < dirtyIndices.length; dirtyIndex++) {
      const i = dirtyIndices[dirtyIndex];
      const itemInstance = orderedItems[i];
      if (!itemInstance) {
        continue;
      }

      captureItemBeforeCommit(itemInstance);
      if (runtime.tryPatchStableForDirtyItem(itemInstance.scope)) {
        continue;
      }

      const dom = syncItemDom(itemInstance, childrenVNodes[i]);
      if (!dom) {
        continue;
      }

      const anchor = childNodes[i] ?? null;
      if (dom.parentNode !== parent || dom !== anchor) {
        recordBenchEvent('domInsert');
        parent.insertBefore(dom, anchor);
      }
    }

    boundaryChildrenExact = true;
  };

  const commitPositional = (): void => {
    for (let i = 0; i < forState.orderedKeys.length; i++) {
      const itemInstance = forState.orderedItems[i];
      if (!itemInstance) {
        continue;
      }

      const dom = syncItemDom(itemInstance, childrenVNodes[i]);
      if (!dom) {
        continue;
      }

      if (dom.parentNode !== parent) {
        const anchor = parent.childNodes[i] ?? null;
        recordBenchEvent('domInsert');
        parent.insertBefore(dom, anchor);
      }
    }

    boundaryChildrenExact = true;
  };

  const commitAppend = (): void => {
    const canHydrateInPlace =
      !forState._hasResolvedItemDom &&
      forState.lastRemovedNodes.length === 0 &&
      parent.childNodes.length === forState.orderedKeys.length;
    if (canHydrateInPlace) {
      let exactOrder = true;
      let currentNode = parent.firstChild;

      for (let i = 0; i < forState.orderedKeys.length; i++) {
        const itemInstance = forState.orderedItems[i];
        if (!itemInstance) {
          exactOrder = false;
          currentNode = currentNode?.nextSibling ?? null;
          continue;
        }

        const dom = syncItemDom(itemInstance, childrenVNodes[i]);
        if (!dom || dom.parentNode !== parent || dom !== currentNode) {
          exactOrder = false;
        }

        currentNode = currentNode?.nextSibling ?? null;
      }

      if (exactOrder) {
        boundaryChildrenExact = true;
        return;
      }
    }

    const appendColdRows = (): void => {
      const pendingAppend: Node[] = [];
      const appendStart = forState.pendingAppendStart ?? 0;
      const hasDetachedSuffix =
        forState.pendingAppendStart !== null &&
        parent.childNodes.length === appendStart;

      for (let i = appendStart; i < forState.orderedKeys.length; i++) {
        const itemInstance = forState.orderedItems[i];
        if (!itemInstance) {
          continue;
        }

        if (
          !hasDetachedSuffix &&
          itemInstance.scope.dom?.parentNode === parent &&
          !itemInstance.scope.needsDomUpdate
        ) {
          continue;
        }

        const dom = syncItemDom(itemInstance, childrenVNodes[i]);
        if (!dom) {
          continue;
        }

        if (hasDetachedSuffix || dom.parentNode !== parent) {
          if (BENCH_BUILD_ENABLED) {
            recordBenchEvent('domInsert');
          }
          pendingAppend.push(dom);
        }
      }

      if (pendingAppend.length > 0) {
        const fragment = parent.ownerDocument.createDocumentFragment();
        if (canUseDirectReplaceChildrenSpread(pendingAppend.length)) {
          fragment.append(...pendingAppend);
        } else {
          for (const node of pendingAppend) {
            fragment.appendChild(node);
          }
        }
        parent.appendChild(fragment);
      }
    };

    if (BENCH_BUILD_ENABLED) {
      withBenchMetricScope('coldCreate', appendColdRows);
    } else {
      appendColdRows();
    }

    boundaryChildrenExact = true;
  };

  const commitInsertOne = (): void => {
    const index = forState.pendingInsertedIndex;
    const item = index === null ? undefined : forState.orderedItems[index];

    if (
      index === null ||
      !item ||
      parent.childNodes.length !== forState.orderedKeys.length - 1
    ) {
      commitReorder();
      return;
    }

    const anchor = parent.childNodes[index] ?? null;
    const dom = syncItemDom(item, childrenVNodes[index]);
    if (dom && (dom.parentNode !== parent || dom !== anchor)) {
      recordBenchEvent('domInsert');
      parent.insertBefore(dom, anchor);
    }
    boundaryChildrenExact = true;
  };

  const commitSwap = (): void => {
    const swapIndices = forState.pendingSwapIndices;
    if (!swapIndices) {
      return;
    }

    let [firstIndex, secondIndex] = swapIndices;
    if (firstIndex === secondIndex) {
      return;
    }

    if (firstIndex > secondIndex) {
      [firstIndex, secondIndex] = [secondIndex, firstIndex];
    }

    const firstKey = forState.orderedKeys[firstIndex];
    const secondKey = forState.orderedKeys[secondIndex];
    const firstItem = forState.items.get(firstKey);
    const secondItem = forState.items.get(secondKey);

    if (!firstItem || !secondItem) {
      commitReorder();
      return;
    }

    const firstDom = syncItemDom(firstItem, childrenVNodes[firstIndex]);
    const secondDom = syncItemDom(secondItem, childrenVNodes[secondIndex]);

    if (!firstDom || !secondDom) {
      commitReorder();
      return;
    }

    if (firstDom.parentNode !== parent || secondDom.parentNode !== parent) {
      commitReorder();
      return;
    }

    const firstBeforeSecond =
      (firstDom.compareDocumentPosition(secondDom) &
        Node.DOCUMENT_POSITION_FOLLOWING) !==
      0;
    if (firstBeforeSecond) {
      boundaryChildrenExact = true;
      return;
    }

    const firstNextSibling = firstDom.nextSibling;
    recordBenchEvent('domMove');
    parent.insertBefore(firstDom, secondDom);
    recordBenchEvent('domMove');
    parent.insertBefore(secondDom, firstNextSibling);

    boundaryChildrenExact = true;
  };

  const commitReorder = (): void => {
    const items = forState.orderedItems;
    const count = items.length;

    if (forState.pendingMoveOnly && forState.lastRemovedNodes.length === 0) {
      const nodes = Array<Node>(count);
      let movedCount = 0;
      let insertedCount = 0;

      for (let i = 0; i < count; i++) {
        const itemInstance = items[i];
        if (!itemInstance) {
          return;
        }

        const scope = itemInstance.scope;
        const dom =
          scope.dom && !scope.needsDomUpdate
            ? scope.dom
            : syncItemDom(itemInstance, childrenVNodes[i]);

        if (!dom) {
          return;
        }

        if (dom.parentNode === parent) {
          movedCount++;
        } else {
          insertedCount++;
        }
        nodes[i] = dom;
      }

      if (!canUseDirectReplaceChildrenSpread(count)) {
        if (movedCount > 0) {
          recordBenchEvent('domMove', movedCount);
        }
        if (insertedCount > 0) {
          recordBenchEvent('domInsert', insertedCount);
        }
        replaceChildrenInOrder(parent, nodes, false);
        boundaryChildrenExact = true;
        return;
      }

      if (insertedCount > 0) {
        if (movedCount > 0) {
          recordBenchEvent('domMove', movedCount);
        }
        recordBenchEvent('domInsert', insertedCount);
        replaceChildrenInOrder(parent, nodes, true);
        boundaryChildrenExact = true;
        return;
      }

      if (count > 1 && commitMoveOnlyReorder(parent, nodes)) {
        boundaryChildrenExact = true;
        return;
      }

      if (movedCount > 0) {
        recordBenchEvent('domMove', movedCount);
      }
      if (insertedCount > 0) {
        recordBenchEvent('domInsert', insertedCount);
      }

      replaceChildrenInOrder(parent, nodes, true);
      boundaryChildrenExact = true;
      return;
    }

    let hasExistingChild = false;
    for (let i = 0; i < count; i++) {
      const itemInstance = items[i];
      if (itemInstance?.scope.dom?.parentNode === parent) {
        hasExistingChild = true;
        break;
      }
    }

    if (!hasExistingChild) {
      const canConsumeRemovedBoundary = isExactRemovedBoundary(
        parent,
        forState.lastRemovedNodes
      );
      const replaceColdRows = (): void => {
        const nodes: Node[] = [];
        for (let i = 0; i < count; i++) {
          const itemInstance = items[i];
          if (!itemInstance) continue;
          const dom = syncItemDom(itemInstance, childrenVNodes[i]);
          if (dom) {
            if (BENCH_BUILD_ENABLED) {
              recordBenchEvent('domInsert');
            }
            nodes.push(dom);
          }
        }
        if (BENCH_BUILD_ENABLED) {
          recordBenchCounter('replaceChildrenCommits');
        }
        replaceChildrenInOrder(parent, nodes, canConsumeRemovedBoundary);
      };

      if (BENCH_BUILD_ENABLED) {
        withBenchMetricScope('coldCreate', replaceColdRows);
      } else {
        replaceColdRows();
      }

      removedBoundaryConsumed = canConsumeRemovedBoundary;
      boundaryChildrenExact = true;
      return;
    }

    if (forState.lastRemovedNodes.length === 0) {
      const nodes: Node[] = [];

      for (let i = 0; i < count; i++) {
        const itemInstance = items[i];
        if (!itemInstance) {
          continue;
        }

        const dom = syncItemDom(itemInstance, childrenVNodes[i]);
        if (!dom) {
          continue;
        }

        recordBenchEvent(dom.parentNode === parent ? 'domMove' : 'domInsert');
        nodes.push(dom);
      }

      replaceChildrenInOrder(parent, nodes, false);
      boundaryChildrenExact = true;
      return;
    }

    for (let i = 0; i < count; i++) {
      const itemInstance = items[i];
      if (!itemInstance) {
        continue;
      }

      const dom = syncItemDom(itemInstance, childrenVNodes[i]);
      if (!dom) {
        continue;
      }

      const anchor = parent.childNodes[i] ?? null;
      if (dom !== anchor) {
        recordBenchEvent('domMove');
        parent.insertBefore(dom, anchor);
      }
    }

    boundaryChildrenExact = true;
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
    commitDirtyNoReorder(dirtyIndices);
    syncKeyedMapFromForState(parent, forState, 'NO_REORDER', []);

    if (BENCH_BUILD_ENABLED) {
      recordBenchTiming('domCommit', performance.now() - domCommitStart);
    }
    clearForDomUpdateState(forState);
    return;
  }

  switch (forState.lastCommitStrategy) {
    case 'NO_REORDER':
      commitDirtyNoReorder(dirtyIndices);
      break;
    case 'REMOVE_ONE':
      commitDirtyNoReorder(dirtyIndices);
      break;
    case 'TRUNCATE':
      commitPositional();
      break;
    case 'APPEND':
      commitAppend();
      break;
    case 'INSERT_ONE':
      commitInsertOne();
      break;
    case 'SWAP':
      commitSwap();
      break;
    case 'FULL_KEYED':
    default:
      commitReorder();
      break;
  }

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

  const syncExactForBoundaryChildren = (): void => {
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
    for (const currentNode of currentNodes) {
      if (expectedNodeSet.has(currentNode)) {
        continue;
      }

      teardownNodeSubtree(currentNode);

      if (currentNode.parentNode === parent) {
        recordBenchEvent('domRemove');
        currentNode.remove();
      }
    }

    replaceChildrenInOrder(parent, expectedNodes, true);
  };

  if (!boundaryChildrenExact) {
    syncExactForBoundaryChildren();
  }
  forState._hasResolvedItemDom = true;
  if (BENCH_BUILD_ENABLED) {
    recordBenchTiming('domCommit', performance.now() - domCommitStart);
  }
  clearForDomUpdateState(forState);
}
