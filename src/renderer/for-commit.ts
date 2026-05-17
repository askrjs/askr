import type { ChildScope } from '../runtime/child-scope';
import {
  clearForDomUpdateState,
  recordBenchCounter,
  recordBenchEvent,
  recordBenchTiming,
  type ForCommitStrategy,
  type ForState,
  withBenchMetricScope,
} from '../runtime/for';
import { teardownNodeSubtree } from './cleanup';
import { keyedElements } from './keyed';
import type { VNode } from './types';
import { canUseDirectReplaceChildrenSpread } from './utils';

export interface ForCommitRuntime {
  isProduction(): boolean;
  syncForItemDom(parent: Element, scope: ChildScope, vnode: VNode): Node | null;
  tryPatchStableForDirtyItem(scope: ChildScope): boolean;
}

function getOrBuildDomKeyMap(
  parent: Element
): Map<string | number, Element> | undefined {
  let keyMap = keyedElements.get(parent);
  if (!keyMap) {
    keyMap = new Map<string | number, Element>();
    for (
      let child = parent.firstElementChild;
      child;
      child = child.nextElementSibling
    ) {
      const key = child.getAttribute('data-key');
      if (key !== null) {
        keyMap.set(key, child);
        const numericKey = Number(key);
        if (!Number.isNaN(numericKey)) {
          keyMap.set(numericKey, child);
        }
      }
    }
    if (keyMap.size > 0) {
      keyedElements.set(parent, keyMap);
    }
  }
  return keyMap.size > 0 ? keyMap : undefined;
}

function hydrateExistingForDomInOrder(
  parent: Element,
  forState: ForState<unknown>
): boolean {
  if (parent.children.length !== forState.orderedKeys.length) {
    return false;
  }

  for (let i = 0; i < forState.orderedKeys.length; i += 1) {
    const itemKey = forState.orderedKeys[i];
    const itemInstance = forState.items.get(itemKey);
    const currentDom = parent.children[i];

    if (
      !itemInstance ||
      currentDom.getAttribute('data-key') !== String(itemKey)
    ) {
      return false;
    }

    itemInstance.scope.dom = currentDom;
    itemInstance.scope.needsDomUpdate = true;
  }

  return true;
}

function removeForBoundaryNodes(parent: Element, removedNodes: Node[]): void {
  if (
    removedNodes.length > 0 &&
    removedNodes.length === parent.childNodes.length
  ) {
    let canBulkClear = true;
    for (let i = 0; i < removedNodes.length; i++) {
      if (removedNodes[i].parentNode !== parent) {
        canBulkClear = false;
        break;
      }
    }

    if (canBulkClear) {
      for (let i = 0; i < removedNodes.length; i++) {
        recordBenchEvent('domRemove');
        teardownNodeSubtree(removedNodes[i]);
      }
      withBenchMetricScope('fullClear', () => {
        recordBenchCounter('bulkClearCommits');
        parent.textContent = '';
      });
      return;
    }
  }

  for (let i = 0; i < removedNodes.length; i++) {
    const node = removedNodes[i];
    if (node.parentNode === parent) {
      recordBenchEvent('domRemove');
      teardownNodeSubtree(node);
      parent.removeChild(node);
    }
  }
}

function syncKeyedMapFromForState(
  parent: Element,
  forState: ForState<unknown>,
  strategy: ForCommitStrategy,
  removedNodes: Node[]
): void {
  const existing = keyedElements.get(parent);
  const ensureMapEntry = (
    map: Map<string | number, Element>,
    key: string | number,
    element: Element
  ): void => {
    map.set(key, element);
    const keyString = String(key);
    map.set(keyString, element);
    const keyNumber = Number(keyString);
    if (!Number.isNaN(keyNumber)) {
      map.set(keyNumber, element);
    }
  };

  if (strategy === 'SWAP') {
    if (existing) {
      return;
    }
  }

  if (strategy === 'FULL_KEYED' && existing && removedNodes.length === 0) {
    return;
  }

  if (strategy === 'NO_REORDER') {
    if (existing && removedNodes.length === 0) {
      return;
    }

    if (existing) {
      for (const [mapKey, element] of existing) {
        if (element.parentNode !== parent) {
          existing.delete(mapKey);
        }
      }

      if (existing.size > 0) {
        keyedElements.set(parent, existing);
      } else {
        keyedElements.delete(parent);
      }
      return;
    }
  }

  if (strategy === 'TRUNCATE' && forState.orderedKeys.length === 0) {
    if (existing) {
      existing.clear();
    }
    keyedElements.delete(parent);
    return;
  }

  if (strategy === 'APPEND' && existing) {
    for (let i = 0; i < forState.orderedKeys.length; i++) {
      const key = forState.orderedKeys[i];
      if (key === null || existing.has(key)) continue;
      const itemInstance = forState.items.get(key);
      if (itemInstance?.scope.dom instanceof Element) {
        ensureMapEntry(existing, key, itemInstance.scope.dom);
      }
    }

    if (existing.size > 0) {
      keyedElements.set(parent, existing);
    } else {
      keyedElements.delete(parent);
    }
    return;
  }

  const nextMap = existing ?? new Map<string | number, Element>();
  nextMap.clear();

  for (let i = 0; i < forState.orderedKeys.length; i++) {
    const key = forState.orderedKeys[i];
    if (key === null) continue;
    const itemInstance = forState.items.get(key);
    if (itemInstance?.scope.dom instanceof Element) {
      ensureMapEntry(nextMap, key, itemInstance.scope.dom);
    }
  }

  if (nextMap.size > 0) {
    keyedElements.set(parent, nextMap);
  } else {
    keyedElements.delete(parent);
  }
}

function replaceChildrenInOrder(
  parent: Element,
  nodes: Node[],
  allowDirectSpread: boolean
): void {
  if (allowDirectSpread && canUseDirectReplaceChildrenSpread(nodes.length)) {
    parent.replaceChildren(...nodes);
    return;
  }

  const fragment = parent.ownerDocument.createDocumentFragment();
  for (let i = 0; i < nodes.length; i++) {
    fragment.appendChild(nodes[i]);
  }
  parent.replaceChildren(fragment);
}

function getLISIndices(sequence: number[]): number[] {
  if (sequence.length === 0) {
    return [];
  }

  const predecessors = sequence.slice();
  const lisIndices: number[] = [0];

  for (let i = 1; i < sequence.length; i += 1) {
    const current = sequence[i];
    const lastLisIndex = lisIndices[lisIndices.length - 1];

    if (sequence[lastLisIndex] < current) {
      predecessors[i] = lastLisIndex;
      lisIndices.push(i);
      continue;
    }

    let lo = 0;
    let hi = lisIndices.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (sequence[lisIndices[mid]] < current) {
        lo = mid + 1;
      } else {
        hi = mid;
      }
    }

    if (current < sequence[lisIndices[lo]]) {
      if (lo > 0) {
        predecessors[i] = lisIndices[lo - 1];
      }
      lisIndices[lo] = i;
    }
  }

  let cursor = lisIndices.length - 1;
  let index = lisIndices[cursor];
  while (cursor >= 0) {
    lisIndices[cursor] = index;
    index = predecessors[index];
    cursor -= 1;
  }

  return lisIndices;
}

function commitMoveOnlyReorder(parent: Element, nodes: Node[]): boolean {
  const currentNodes = Array.from(parent.childNodes);
  if (currentNodes.length !== nodes.length) {
    return false;
  }

  const currentIndexByNode = new Map<Node, number>();
  for (let i = 0; i < currentNodes.length; i += 1) {
    currentIndexByNode.set(currentNodes[i], i);
  }

  const positions = Array.from({ length: nodes.length }, () => 0);
  for (let i = 0; i < nodes.length; i += 1) {
    const position = currentIndexByNode.get(nodes[i]);
    if (position === undefined) {
      return false;
    }
    positions[i] = position;
  }

  const lisIndices = getLISIndices(positions);
  if (lisIndices.length === nodes.length) {
    return true;
  }

  let lisCursor = lisIndices.length - 1;
  let anchor: Node | null = null;

  for (let i = nodes.length - 1; i >= 0; i -= 1) {
    const node = nodes[i];
    if (lisCursor >= 0 && i === lisIndices[lisCursor]) {
      anchor = node;
      lisCursor -= 1;
      continue;
    }

    if (node.nextSibling !== anchor) {
      recordBenchEvent('domMove');
      parent.insertBefore(node, anchor);
    }

    anchor = node;
  }

  return true;
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
