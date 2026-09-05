import type { DOMRange } from '../common/dom-range';
import {
  captureForFallbackTransactionSnapshot,
  captureForItemTransactionSnapshot,
  clearForDomUpdateState,
  recordBenchEvent,
  registerCommitEffect,
  type ChildScope,
  type ForState,
} from '../runtime';
import {
  getAttachedScopeRange,
  getScopeRange as getLiveScopeRange,
} from './boundary-range-adoption';
import { teardownNodeSubtree } from './cleanup';
import {
  findRangeEnd,
  getRangeNodes,
  isRangeStart,
  moveRange,
  rangeContains,
} from './dom-range';
import { isMultiNodeVNode } from './vnode-shape';
import { isHydrationAdoptionScopeActive } from './intrinsic-hydration-adoption';
import { _isDOMElement, type VNode } from './types';

declare const __ASKR_BENCH_BUILD__: boolean;

const BENCH_BUILD_ENABLED = __ASKR_BENCH_BUILD__;

export interface ForRangeCommitRuntime {
  syncForItemRange(
    parent: Element,
    scope: ChildScope,
    vnode: VNode,
    before?: Node | null
  ): DOMRange | null;
}

export interface PreparedForCommitRanges {
  needsAnchoredRanges: boolean;
  preResolvedRanges: Map<ChildScope, DOMRange | null>;
  previousRanges: DOMRange[];
}

function discoverForCommitRanges(parent: Element): DOMRange[] {
  const ranges: DOMRange[] = [];
  let current: Node | null = parent.firstChild;
  while (current) {
    if (isRangeStart(current)) {
      const end = findRangeEnd(current);
      if (end?.parentNode === parent) {
        ranges.push({ start: current, end, single: false });
        current = end.nextSibling;
        continue;
      }
    }
    ranges.push({ start: current, end: current, single: true });
    current = current.nextSibling;
  }
  return ranges;
}

export function prepareForCommitRanges(
  parent: Element,
  forState: ForState<unknown>,
  childrenVNodes: VNode[],
  runtime: ForRangeCommitRuntime
): PreparedForCommitRanges {
  const preResolvedRanges = new Map<ChildScope, DOMRange | null>();
  let resolutionBefore = isHydrationAdoptionScopeActive()
    ? parent.firstChild
    : null;
  const preResolve = (
    scope: ChildScope,
    vnode: VNode,
    capture: () => void
  ): DOMRange | null => {
    const shapeUnknown =
      isMultiNodeVNode(vnode) ||
      (_isDOMElement(vnode) && typeof vnode.type === 'function');
    if (!shapeUnknown) {
      return getAttachedScopeRange(parent, scope);
    }
    const currentRange = getAttachedScopeRange(parent, scope);
    const shouldResolve =
      shapeUnknown &&
      (scope.hydrationPending || scope.needsDomUpdate || !currentRange);
    if (!shouldResolve) {
      return currentRange;
    }
    capture();
    const range = runtime.syncForItemRange(
      parent,
      scope,
      vnode,
      resolutionBefore
    );
    preResolvedRanges.set(scope, range);
    if (range) {
      if (
        range.start.parentNode === parent &&
        range.end.parentNode === parent
      ) {
        resolutionBefore = range.end.nextSibling;
      }
    }
    return range;
  };

  if (forState.orderedKeys.length === 0) {
    const scope = forState.fallbackScope;
    const vnode = childrenVNodes[0];
    if (scope && vnode !== undefined) {
      preResolve(scope, vnode, () =>
        captureForFallbackTransactionSnapshot(forState, scope)
      );
    }
  } else {
    const resolveItemAt = (index: number): void => {
      const item = forState.orderedItems[index];
      if (!item) return;
      const { scope } = item;
      if (
        !scope.needsDomUpdate &&
        !scope.hydrationPending &&
        (scope.range || scope.dom)
      ) {
        return;
      }
      const vnode = childrenVNodes[index];
      if (vnode === undefined) return;
      preResolve(item.scope, vnode, () =>
        captureForItemTransactionSnapshot(forState, item)
      );
    };

    if (
      !forState._hasResolvedItemDom ||
      isHydrationAdoptionScopeActive() ||
      forState.lastCommitStrategy === 'FULL_KEYED'
    ) {
      for (let index = 0; index < forState.orderedItems.length; index += 1) {
        resolveItemAt(index);
      }
    } else {
      for (const index of forState.pendingDirtyIndices ?? []) {
        resolveItemAt(index);
      }
      if (forState.pendingInsertedIndex !== null) {
        resolveItemAt(forState.pendingInsertedIndex);
      }
      if (forState.pendingAppendStart !== null) {
        for (
          let index = forState.pendingAppendStart;
          index < forState.orderedItems.length;
          index += 1
        ) {
          resolveItemAt(index);
        }
      }
    }
  }

  const explicitMultiNodeResult = childrenVNodes.some(isMultiNodeVNode);
  const removedMultiNodeRange = forState.lastRemovedRanges.some(
    (range) => !range.single
  );
  const cachedMultiNodeRange = forState.orderedItems.some(
    (item) => item.scope.range?.single === false
  );
  const liveMultiNodeRange =
    forState.orderedKeys.length > 0 &&
    parent.childNodes.length !== forState.orderedItems.length &&
    forState.orderedItems.some((item) => {
      const range = getAttachedScopeRange(parent, item.scope);
      return Boolean(range && !range.single);
    });
  const fallbackRange =
    forState.orderedKeys.length === 0 && forState.fallbackScope
      ? getAttachedScopeRange(parent, forState.fallbackScope)
      : null;
  const needsAnchoredRanges =
    explicitMultiNodeResult ||
    removedMultiNodeRange ||
    cachedMultiNodeRange ||
    liveMultiNodeRange ||
    Boolean(fallbackRange && !fallbackRange.single);
  const previousRanges = needsAnchoredRanges
    ? discoverForCommitRanges(parent)
    : [];

  return { needsAnchoredRanges, preResolvedRanges, previousRanges };
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

export function deferBoundaryNodeFinalization(
  nodes: Node[],
  forState: ForState<unknown>,
  exactPredecessor = false
): void {
  if (nodes.length === 0) {
    return;
  }

  // Normal list removals are already finalized by the For transaction. This
  // path owns only predecessor DOM displaced by a fresh boundary generation.
  if (
    !exactPredecessor &&
    (forState.lastRemovedNodes.length > 0 ||
      forState.lastRemovedRanges.length > 0)
  ) {
    return;
  }
  const pending = nodes.slice();

  const finalize = (): void => {
    const errors: unknown[] = [];
    for (const node of pending) {
      try {
        teardownNodeSubtree(node);
      } catch (error) {
        errors.push(error);
      }
    }
    pending.length = 0;
    if (errors.length > 0) {
      throw new AggregateError(errors, 'For boundary handoff cleanup failed');
    }
  };

  if (!registerCommitEffect(pending, finalize, () => undefined)) {
    finalize();
  }
}

function getInclusiveRangeNodes(range: DOMRange): Node[] {
  return range.single
    ? [range.start]
    : [range.start, ...getRangeNodes(range), range.end];
}

function detachStalePredecessorRanges(
  parent: Element,
  previousRanges: DOMRange[],
  desiredRanges: DOMRange[],
  forState: ForState<unknown>
): void {
  for (const previous of previousRanges) {
    if (
      previous.start.parentNode !== parent ||
      previous.end.parentNode !== parent
    ) {
      continue;
    }
    const previousNodes = getInclusiveRangeNodes(previous);
    const retained = previousNodes.every((node) =>
      desiredRanges.some((desired) => rangeContains(desired, node))
    );
    if (retained) continue;

    detachRange(previous);
    deferBoundaryNodeFinalization(previousNodes, forState, true);
  }
}

export function commitForStateBoundaryRanges(
  parent: Element,
  forState: ForState<unknown>,
  childrenVNodes: VNode[],
  runtime: ForRangeCommitRuntime,
  preResolvedRanges: Map<ChildScope, DOMRange | null>,
  previousRanges: DOMRange[]
): void {
  const desiredRanges: DOMRange[] = [];
  const adoptingHydration = isHydrationAdoptionScopeActive();
  let hydrationBefore = adoptingHydration ? parent.firstChild : null;

  const syncRange = (
    scope: ChildScope,
    vnode: VNode,
    needsDomUpdate: boolean
  ): DOMRange | null => {
    const wasPreResolved = preResolvedRanges.has(scope);
    const range = wasPreResolved
      ? (preResolvedRanges.get(scope) ?? null)
      : needsDomUpdate
        ? runtime.syncForItemRange(parent, scope, vnode, hydrationBefore)
        : getLiveScopeRange(scope);
    if (
      adoptingHydration &&
      range &&
      range.start.parentNode === parent &&
      range.end.parentNode === parent
    ) {
      hydrationBefore = range.end.nextSibling;
    }
    return range;
  };

  if (forState.orderedKeys.length === 0) {
    const fallbackScope = forState.fallbackScope;
    const fallbackVNode = childrenVNodes[0];
    if (fallbackScope && fallbackVNode !== undefined) {
      const range = syncRange(
        fallbackScope,
        fallbackVNode,
        fallbackScope.needsDomUpdate || fallbackScope.hydrationPending
      );
      if (range) desiredRanges.push(range);
    }
  } else {
    for (let index = 0; index < forState.orderedItems.length; index += 1) {
      const item = forState.orderedItems[index];
      if (!item) continue;
      if (item.scope.needsDomUpdate || item.scope.hydrationPending) {
        captureForItemTransactionSnapshot(forState, item);
      }
      const range = syncRange(
        item.scope,
        childrenVNodes[index],
        item.scope.needsDomUpdate || item.scope.hydrationPending
      );
      if (range) desiredRanges.push(range);
    }
  }

  detachRemovedForNodes(parent, forState);
  detachStalePredecessorRanges(parent, previousRanges, desiredRanges, forState);

  const placeRange = (range: DOMRange, before: Node | null): boolean => {
    const wasInParent =
      range.start.parentNode === parent && range.end.parentNode === parent;
    const moved = moveRange(parent, range, before);
    if (BENCH_BUILD_ENABLED && moved) {
      recordBenchEvent(wasInParent ? 'domMove' : 'domInsert');
    }
    return moved;
  };

  let committedSwap = false;
  const swapIndices = forState.pendingSwapIndices;
  if (swapIndices) {
    const [firstIndex, secondIndex] = swapIndices;
    const desiredFirst = desiredRanges[firstIndex];
    const desiredSecond = desiredRanges[secondIndex];
    if (
      desiredFirst &&
      desiredSecond &&
      desiredFirst.start.parentNode === parent &&
      desiredFirst.end.parentNode === parent &&
      desiredSecond.start.parentNode === parent &&
      desiredSecond.end.parentNode === parent &&
      (desiredSecond.start.compareDocumentPosition(desiredFirst.start) &
        Node.DOCUMENT_POSITION_FOLLOWING) !==
        0
    ) {
      const afterLaterRange = desiredFirst.end.nextSibling;
      placeRange(desiredFirst, desiredSecond.start);
      placeRange(desiredSecond, afterLaterRange);
      committedSwap = true;
    }
  }

  if (!committedSwap) {
    let anchor: Node | null = null;
    for (let index = desiredRanges.length - 1; index >= 0; index -= 1) {
      const range = desiredRanges[index]!;
      placeRange(range, anchor);
      anchor = range.start;
    }
  }

  forState._hasResolvedItemDom = true;
  clearForDomUpdateState(forState);
}
