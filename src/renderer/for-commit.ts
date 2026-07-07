import type { ChildScope } from '../runtime';
import {
  clearForDomUpdateState,
  recordBenchCounter,
  recordBenchEvent,
  recordBenchTiming,
  type ForState,
  withBenchMetricScope,
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

export interface ForCommitRuntime {
  isProduction(): boolean;
  syncForItemDom(parent: Element, scope: ChildScope, vnode: VNode): Node | null;
  tryPatchStableForDirtyItem(scope: ChildScope): boolean;
}

export function commitForStateBoundaryChildren(
  parent: Element,
  forState: ForState<unknown>,
  childrenVNodes: VNode[],
  runtime: ForCommitRuntime
): void {
  const domCommitStart = performance.now();

  const hydrateExistingForDom = (): void => {
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

      itemInstance.scope.dom = existingDom;
      itemInstance.scope.needsDomUpdate = true;
    }
  };

  if (forState.orderedKeys.length === 0) {
    removeForBoundaryNodes(parent, forState.lastRemovedNodes);

    const fallbackScope = forState.fallbackScope;
    const fallbackVNode = childrenVNodes[0];
    const nextDom =
      fallbackScope && fallbackVNode !== undefined
        ? runtime.syncForItemDom(parent, fallbackScope, fallbackVNode)
        : null;

    if (nextDom) {
      if (
        parent.childNodes.length !== 1 ||
        parent.firstChild !== nextDom ||
        forState.lastRemovedNodes.length > 0
      ) {
        parent.replaceChildren(nextDom);
      }
    } else if (parent.firstChild) {
      parent.textContent = '';
    }

    keyedElements.delete(parent);
    forState._hasResolvedItemDom = false;
    recordBenchTiming('domCommit', performance.now() - domCommitStart);
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
    forState.lastCommitStrategy === 'NO_REORDER' ? ensureDirtyIndices() : [];
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

      if (runtime.tryPatchStableForDirtyItem(itemInstance.scope)) {
        continue;
      }

      const dom = runtime.syncForItemDom(
        parent,
        itemInstance.scope,
        childrenVNodes[i]
      );
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

      const dom = runtime.syncForItemDom(
        parent,
        itemInstance.scope,
        childrenVNodes[i]
      );
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

        const dom = runtime.syncForItemDom(
          parent,
          itemInstance.scope,
          childrenVNodes[i]
        );
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

    withBenchMetricScope('coldCreate', () => {
      const fragment = parent.ownerDocument.createDocumentFragment();
      let hasPendingAppend = false;

      for (let i = 0; i < forState.orderedKeys.length; i++) {
        const itemInstance = forState.orderedItems[i];
        if (!itemInstance) {
          continue;
        }

        if (
          itemInstance.scope.dom?.parentNode === parent &&
          !itemInstance.scope.needsDomUpdate
        ) {
          continue;
        }

        const dom = runtime.syncForItemDom(
          parent,
          itemInstance.scope,
          childrenVNodes[i]
        );
        if (!dom) {
          continue;
        }

        if (dom.parentNode !== parent) {
          recordBenchEvent('domInsert');
          fragment.appendChild(dom);
          hasPendingAppend = true;
        }
      }

      if (hasPendingAppend) {
        parent.appendChild(fragment);
      }
    });

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

    const firstDom = runtime.syncForItemDom(
      parent,
      firstItem.scope,
      childrenVNodes[firstIndex]
    );
    const secondDom = runtime.syncForItemDom(
      parent,
      secondItem.scope,
      childrenVNodes[secondIndex]
    );

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
            : runtime.syncForItemDom(parent, scope, childrenVNodes[i]);

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
      withBenchMetricScope('coldCreate', () => {
        const nodes: Node[] = [];
        for (let i = 0; i < count; i++) {
          const itemInstance = items[i];
          if (!itemInstance) continue;
          const dom = runtime.syncForItemDom(
            parent,
            itemInstance.scope,
            childrenVNodes[i]
          );
          if (dom) {
            recordBenchEvent('domInsert');
            nodes.push(dom);
          }
        }
        recordBenchCounter('replaceChildrenCommits');
        replaceChildrenInOrder(parent, nodes, false);
      });

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

        const dom = runtime.syncForItemDom(
          parent,
          itemInstance.scope,
          childrenVNodes[i]
        );
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

      const dom = runtime.syncForItemDom(
        parent,
        itemInstance.scope,
        childrenVNodes[i]
      );
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

    recordBenchTiming('domCommit', performance.now() - domCommitStart);
    clearForDomUpdateState(forState);
    return;
  }

  switch (forState.lastCommitStrategy) {
    case 'NO_REORDER':
      commitDirtyNoReorder(dirtyIndices);
      break;
    case 'TRUNCATE':
      commitPositional();
      break;
    case 'APPEND':
      commitAppend();
      break;
    case 'SWAP':
      commitSwap();
      break;
    case 'FULL_KEYED':
    default:
      commitReorder();
      break;
  }

  removeForBoundaryNodes(parent, forState.lastRemovedNodes);
  if (forState.lastRemovedNodes.length > 0) {
    boundaryChildrenExact = false;
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
          : runtime.syncForItemDom(
              parent,
              itemInstance.scope,
              childrenVNodes[i]
            );
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
  recordBenchTiming('domCommit', performance.now() - domCommitStart);
  clearForDomUpdateState(forState);
}
