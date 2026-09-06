import type { ForCommitPlan } from '../../runtime';
import {
  recordBenchCounter,
  recordBenchEvent,
  withBenchMetricScope,
} from '../../runtime';
import type { VNode } from '../types';
import type { ForCommitRuntime } from './commit';
import type { prepareForCommitRanges } from './ranges';
import { canUseDirectReplaceChildrenSpread } from '../utils';
import { commitMoveOnlyReorder, replaceChildrenInOrder } from './reorder';
declare const __ASKR_BENCH_BUILD__: boolean;
const BENCH_BUILD_ENABLED = __ASKR_BENCH_BUILD__;
export function isExactRemovedBoundary(
  parent: Element,
  removedNodes: readonly Node[]
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

interface ForStrategyInputs {
  parent: Element;
  runtime: Pick<ForCommitRuntime, 'tryPatchStableForDirtyItem'>;
  preResolvedRanges: ReturnType<
    typeof prepareForCommitRanges
  >['preResolvedRanges'];
  captureItemBeforeCommit(item: ForCommitPlan['items'][number]): void;
  syncItemDom(item: ForCommitPlan['items'][number], vnode: VNode): Node | null;
}
export function commitForStrategy(
  plan: ForCommitPlan,
  {
    parent,
    runtime,
    preResolvedRanges,
    captureItemBeforeCommit,
    syncItemDom,
  }: ForStrategyInputs
): { boundaryChildrenExact: boolean; removedBoundaryConsumed: boolean } {
  const childrenVNodes = plan.vnodes;
  let boundaryChildrenExact = false;
  let removedBoundaryConsumed = false;
  const commitDirtyNoReorder = (dirtyIndices: readonly number[]): void => {
    if (dirtyIndices.length === 0) {
      boundaryChildrenExact = true;
      return;
    }

    if (plan.kind !== 'NO_REORDER') return;
    const orderedItems = plan.items;
    const childNodes = parent.childNodes;
    const canPatchStableDirtyItems = plan.allowStablePatch;

    for (let dirtyIndex = 0; dirtyIndex < dirtyIndices.length; dirtyIndex++) {
      const i = dirtyIndices[dirtyIndex];
      const itemInstance = orderedItems[i];
      if (!itemInstance) {
        continue;
      }

      captureItemBeforeCommit(itemInstance);
      if (
        canPatchStableDirtyItems &&
        !preResolvedRanges.has(itemInstance.scope) &&
        runtime.tryPatchStableForDirtyItem(itemInstance.scope)
      ) {
        if (BENCH_BUILD_ENABLED) {
          recordBenchCounter('itemDomSyncCalls');
        }
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

  const commitAppend = (): void => {
    if (plan.kind !== 'APPEND') return;
    const canHydrateInPlace =
      plan.canHydrate &&
      plan.removedNodes.length === 0 &&
      parent.childNodes.length === plan.items.length;
    if (canHydrateInPlace) {
      let exactOrder = true;
      let currentNode = parent.firstChild;

      for (let i = 0; i < plan.items.length; i++) {
        const itemInstance = plan.items[i];
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
      const appendStart = plan.appendStart ?? 0;
      const hasDetachedSuffix =
        plan.appendStart !== null && parent.childNodes.length === appendStart;

      for (let i = appendStart; i < plan.items.length; i++) {
        const itemInstance = plan.items[i];
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

    boundaryChildrenExact = parent.childNodes.length === plan.items.length;
  };

  const commitInsertOne = (): void => {
    if (plan.kind !== 'INSERT_ONE') return;
    const index = plan.index;
    const item = index === null ? undefined : plan.items[index];

    if (
      index === null ||
      !item ||
      parent.childNodes.length !== plan.items.length - 1
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
    if (plan.kind !== 'SWAP') return;
    const swapIndices = plan.indices;
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

    const firstItem = plan.items[firstIndex];
    const secondItem = plan.items[secondIndex];

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
    const items = plan.items;
    const count = items.length;

    if (plan.moveOnly && plan.removedNodes.length === 0) {
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

      if (insertedCount > 0) {
        if (movedCount > 0) {
          recordBenchEvent('domMove', movedCount);
        }
        recordBenchEvent('domInsert', insertedCount);
        replaceChildrenInOrder(
          parent,
          nodes,
          canUseDirectReplaceChildrenSpread(count)
        );
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
        plan.removedNodes
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

    if (plan.removedNodes.length === 0) {
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

  switch (plan.kind) {
    case 'NO_REORDER':
      commitDirtyNoReorder(plan.dirtyIndices);
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
      commitReorder();
      break;
  }
  return { boundaryChildrenExact, removedBoundaryConsumed };
}
