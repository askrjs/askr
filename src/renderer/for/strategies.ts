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

/**
 * What a strategy leaves behind for the caller.
 *
 * Strategies return this instead of writing shared state, so each one is a
 * self-contained function rather than a closure over the commit in progress.
 * The caller only reads these fields, so the three outcomes are shared
 * constants rather than fresh objects on every commit.
 */
export interface ForStrategyResult {
  readonly boundaryChildrenExact: boolean;
  readonly removedBoundaryConsumed: boolean;
}

const NEITHER: ForStrategyResult = {
  boundaryChildrenExact: false,
  removedBoundaryConsumed: false,
};
const EXACT: ForStrategyResult = {
  boundaryChildrenExact: true,
  removedBoundaryConsumed: false,
};
const EXACT_CONSUMED: ForStrategyResult = {
  boundaryChildrenExact: true,
  removedBoundaryConsumed: true,
};

function commitDirtyNoReorder(
  plan: ForCommitPlan,
  {
    parent,
    runtime,
    preResolvedRanges,
    captureItemBeforeCommit,
    syncItemDom,
  }: ForStrategyInputs
): ForStrategyResult {
  if (plan.kind !== 'NO_REORDER') return NEITHER;
  const dirtyIndices = plan.dirtyIndices;
  if (dirtyIndices.length === 0) {
    return EXACT;
  }

  const childrenVNodes = plan.vnodes;
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

  return EXACT;
}

function commitAppend(
  plan: ForCommitPlan,
  inputs: ForStrategyInputs
): ForStrategyResult {
  if (plan.kind !== 'APPEND') return NEITHER;
  const { parent, syncItemDom } = inputs;
  const childrenVNodes = plan.vnodes;
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
      return EXACT;
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

  return parent.childNodes.length === plan.items.length ? EXACT : NEITHER;
}

function commitInsertOne(
  plan: ForCommitPlan,
  inputs: ForStrategyInputs
): ForStrategyResult {
  if (plan.kind !== 'INSERT_ONE') return NEITHER;
  const { parent, syncItemDom } = inputs;
  const childrenVNodes = plan.vnodes;
  const index = plan.index;
  const item = index === null ? undefined : plan.items[index];

  if (
    index === null ||
    !item ||
    parent.childNodes.length !== plan.items.length - 1
  ) {
    return commitReorder(plan, inputs);
  }

  const anchor = parent.childNodes[index] ?? null;
  const dom = syncItemDom(item, childrenVNodes[index]);
  if (dom && (dom.parentNode !== parent || dom !== anchor)) {
    recordBenchEvent('domInsert');
    parent.insertBefore(dom, anchor);
  }
  return EXACT;
}

function commitSwap(
  plan: ForCommitPlan,
  inputs: ForStrategyInputs
): ForStrategyResult {
  if (plan.kind !== 'SWAP') return NEITHER;
  const { parent, syncItemDom } = inputs;
  const childrenVNodes = plan.vnodes;
  const swapIndices = plan.indices;
  if (!swapIndices) {
    return NEITHER;
  }

  let [firstIndex, secondIndex] = swapIndices;
  if (firstIndex === secondIndex) {
    return NEITHER;
  }

  if (firstIndex > secondIndex) {
    [firstIndex, secondIndex] = [secondIndex, firstIndex];
  }

  const firstItem = plan.items[firstIndex];
  const secondItem = plan.items[secondIndex];

  if (!firstItem || !secondItem) {
    return commitReorder(plan, inputs);
  }

  const firstDom = syncItemDom(firstItem, childrenVNodes[firstIndex]);
  const secondDom = syncItemDom(secondItem, childrenVNodes[secondIndex]);

  if (!firstDom || !secondDom) {
    return commitReorder(plan, inputs);
  }

  if (firstDom.parentNode !== parent || secondDom.parentNode !== parent) {
    return commitReorder(plan, inputs);
  }

  const firstBeforeSecond =
    (firstDom.compareDocumentPosition(secondDom) &
      Node.DOCUMENT_POSITION_FOLLOWING) !==
    0;
  if (firstBeforeSecond) {
    return EXACT;
  }

  const firstNextSibling = firstDom.nextSibling;
  recordBenchEvent('domMove');
  parent.insertBefore(firstDom, secondDom);
  recordBenchEvent('domMove');
  parent.insertBefore(secondDom, firstNextSibling);

  return EXACT;
}

function commitReorder(
  plan: ForCommitPlan,
  { parent, syncItemDom }: ForStrategyInputs
): ForStrategyResult {
  const childrenVNodes = plan.vnodes;
  const items = plan.items;
  const count = items.length;

  if (plan.moveOnly && plan.removedNodes.length === 0) {
    const nodes = Array<Node>(count);
    let movedCount = 0;
    let insertedCount = 0;

    for (let i = 0; i < count; i++) {
      const itemInstance = items[i];
      if (!itemInstance) {
        return NEITHER;
      }

      const scope = itemInstance.scope;
      const dom =
        scope.dom && !scope.needsDomUpdate
          ? scope.dom
          : syncItemDom(itemInstance, childrenVNodes[i]);

      if (!dom) {
        return NEITHER;
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
      return EXACT;
    }

    if (count > 1 && commitMoveOnlyReorder(parent, nodes)) {
      return EXACT;
    }

    if (movedCount > 0) {
      recordBenchEvent('domMove', movedCount);
    }
    if (insertedCount > 0) {
      recordBenchEvent('domInsert', insertedCount);
    }

    replaceChildrenInOrder(parent, nodes, true);
    return EXACT;
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

    return canConsumeRemovedBoundary ? EXACT_CONSUMED : EXACT;
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
    return EXACT;
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

  return EXACT;
}

export function commitForStrategy(
  plan: ForCommitPlan,
  inputs: ForStrategyInputs
): ForStrategyResult {
  switch (plan.kind) {
    case 'NO_REORDER':
      return commitDirtyNoReorder(plan, inputs);
    case 'APPEND':
      return commitAppend(plan, inputs);
    case 'INSERT_ONE':
      return commitInsertOne(plan, inputs);
    case 'SWAP':
      return commitSwap(plan, inputs);
    case 'FULL_KEYED':
      return commitReorder(plan, inputs);
  }
}
