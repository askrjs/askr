import type { ComponentFunction } from '../../runtime';
import { trySyncControlBoundaryChild } from '../control/boundaries';
import { retireComponentOwnersForIntrinsicReuse } from '../component/host-cleanup';
import { retireNodeSubtree } from '../ownership/cleanup';
import { getRendererDOMHost, type ElementWithContext } from '../dom-host';
import { getParentNamespace } from '../intrinsic/namespaces';
import { findRangeEnd, isRangeStart } from '../ownership/ranges';
import { tagsEqualIgnoreCase } from './static-reuse';
import { collectChildKinds, isEmptyChild, isScalarChild } from './child-shape';
import { _isDOMElement, type DOMElement } from '../types';

/**
 * Everything the per-child operations below need, resolved once per commit.
 *
 * These operations were previously written out at every index of three
 * different traversals, which is why the same "same tag, so update in place,
 * otherwise build a replacement" decision appeared three times and the
 * hydration-aware component sync appeared twice in the same loop.
 */
interface UnkeyedCommit {
  readonly parent: Element;
  readonly parentNamespace: string | undefined;
  readonly domHost: ReturnType<typeof getRendererDOMHost>;
  readonly forceUpdate: boolean;
}

/** Replace `current` with a node freshly built for `next`. */
function replaceWithFresh(
  commit: UnkeyedCommit,
  current: Node,
  next: unknown
): void {
  const dom = commit.domHost.createDOMNode(next, commit.parentNamespace);
  if (!dom) return;
  retireNodeSubtree(current);
  commit.parent.replaceChild(dom, current);
}

/**
 * Replace `current`, or insert at `anchor` when it has already left the parent.
 *
 * `anchor` is read lazily because the original order matters: the replacement
 * is built and the outgoing subtree retired before the anchor is looked up, and
 * retirement can run component cleanup.
 */
function replaceOrInsertFresh(
  commit: UnkeyedCommit,
  current: Node,
  next: unknown,
  anchor: () => Node | null
): void {
  const dom = commit.domHost.createDOMNode(next, commit.parentNamespace);
  if (!dom) return;
  retireNodeSubtree(current);
  if (current.parentNode === commit.parent) {
    commit.parent.replaceChild(dom, current);
  } else if (dom.parentNode !== commit.parent) {
    commit.parent.insertBefore(dom, anchor());
  }
}

/** Reuse `current` for an intrinsic vnode of the same tag, else replace it. */
function commitIntrinsicChild(
  commit: UnkeyedCommit,
  current: Element,
  next: DOMElement,
  anchor?: () => Node | null
): void {
  if (tagsEqualIgnoreCase(current.tagName, next.type as string)) {
    commit.domHost.updateElementFromVnode(
      current,
      next,
      true,
      commit.forceUpdate
    );
    retireComponentOwnersForIntrinsicReuse(current);
    return;
  }
  if (anchor) {
    replaceOrInsertFresh(commit, current, next, anchor);
  } else {
    replaceWithFresh(commit, current, next);
  }
}

/** Apply a component vnode to `currentDom`, or decline when it is not one. */
function syncComponentChild(
  commit: UnkeyedCommit,
  currentDom: Node,
  next: DOMElement,
  hydrationRangeEnd?: Node | null
): Node | null {
  if (typeof next.type !== 'function') {
    return null;
  }

  return commit.domHost.syncComponentElement(
    currentDom,
    next as ElementWithContext,
    next.type as ComponentFunction,
    ((next.props ?? {}) as Record<string, unknown>) || {},
    commit.parentNamespace,
    commit.forceUpdate,
    undefined,
    hydrationRangeEnd,
    true
  );
}

/**
 * Narrow a node snapshot to the hydrated range a component adopted.
 *
 * The snapshot is positional, so adopting a multi-node range has to collapse
 * the nodes it swallowed down to the range's start marker.
 */
function replaceHydratedRangeInSnapshot(
  nodes: Node[],
  index: number,
  rangeStart: Comment,
  fallbackEndIndex: number
): void {
  const rangeEnd = findRangeEnd(rangeStart);
  const following = rangeEnd?.nextSibling ?? null;
  const followingIndex =
    following === null ? nodes.length : nodes.indexOf(following, index);
  const endIndex = followingIndex >= index ? followingIndex : fallbackEndIndex;
  nodes.splice(index, Math.max(1, endIndex - index), rangeStart);
}

/**
 * Commit a component child against a positional node snapshot.
 *
 * A component may adopt several existing nodes during hydration, so the sync is
 * given the end of the range it is allowed to claim, and the snapshot is then
 * reconciled with whatever it actually took. Both branches of the mixed
 * traversal needed this and each had written it out.
 *
 * Returns `true` when the child is committed and the caller should move on.
 */
function commitComponentAgainstSnapshot(
  commit: UnkeyedCommit,
  allNodes: Node[],
  index: number,
  currentNode: Node,
  next: DOMElement,
  expectedLength: number
): boolean {
  const remainingExpected = expectedLength - index - 1;
  const hydrationRangeEndIndex = allNodes.length - remainingExpected;
  const hydrationRangeEnd =
    hydrationRangeEndIndex > index
      ? (allNodes[hydrationRangeEndIndex] ?? null)
      : undefined;

  const synced = syncComponentChild(
    commit,
    currentNode,
    next,
    hydrationRangeEnd
  );

  if (synced && isRangeStart(synced)) {
    replaceHydratedRangeInSnapshot(
      allNodes,
      index,
      synced,
      hydrationRangeEndIndex
    );
    return true;
  }

  if (synced && synced !== currentNode && synced.nextSibling === currentNode) {
    allNodes.splice(index, 0, synced);
    return true;
  }

  return Boolean(synced);
}

/**
 * Every child is an element and the counts already line up.
 *
 * The cheapest shape: walk `parent.children` in step with the new list and
 * update each position in place.
 */
function commitAlignedElements(
  commit: UnkeyedCommit,
  newChildren: unknown[]
): void {
  const { parent } = commit;
  const children = parent.children;
  for (let i = 0; i < newChildren.length; i++) {
    const next = newChildren[i];
    const current = children[i];
    if (!current || next === undefined) continue;

    if (_isDOMElement(next) && typeof next.type === 'string') {
      commitIntrinsicChild(commit, current, next);
    } else if (_isDOMElement(next)) {
      if (trySyncControlBoundaryChild(parent, current, next)) {
        continue;
      }
      if (!syncComponentChild(commit, current, next)) {
        replaceOrInsertFresh(
          commit,
          current,
          next,
          () => parent.children[i] ?? null
        );
      }
    } else {
      replaceWithFresh(commit, current, next);
    }
  }
}

/**
 * The list holds text, components, holes, or the parent holds non-element nodes.
 *
 * Positions are tracked against a snapshot of every child node rather than the
 * element children, because text nodes and hydrated component ranges occupy
 * positions that `parent.children` does not report.
 */
function commitMixedContent(
  commit: UnkeyedCommit,
  newChildren: unknown[]
): void {
  const { parent } = commit;
  const allNodes: Node[] = Array.from(parent.childNodes);

  for (let i = 0; i < Math.max(allNodes.length, newChildren.length); i += 1) {
    const currentNode = allNodes[i];
    const next = newChildren[i];
    const nextIsEmpty = isEmptyChild(next);

    if (nextIsEmpty && currentNode) {
      retireNodeSubtree(currentNode);
      currentNode.parentNode?.removeChild(currentNode);
      continue;
    }

    if (!currentNode && !nextIsEmpty) {
      const dom = commit.domHost.createDOMNode(next, commit.parentNamespace);
      if (dom) parent.appendChild(dom);
      continue;
    }

    if (!currentNode || nextIsEmpty) continue;

    if (isScalarChild(next)) {
      if (currentNode.nodeType === 3) {
        (currentNode as Text).data = String(next);
      } else {
        replaceWithFresh(commit, currentNode, next);
      }
      continue;
    }

    if (!_isDOMElement(next)) continue;

    if (currentNode.nodeType !== 1) {
      if (
        typeof next.type === 'function' &&
        commitComponentAgainstSnapshot(
          commit,
          allNodes,
          i,
          currentNode,
          next,
          newChildren.length
        )
      ) {
        continue;
      }
      replaceWithFresh(commit, currentNode, next);
      continue;
    }

    const currentEl = currentNode as Element;
    if (typeof next.type === 'string') {
      commitIntrinsicChild(
        commit,
        currentEl,
        next,
        () => parent.childNodes[i] ?? null
      );
      continue;
    }

    if (trySyncControlBoundaryChild(parent, currentNode, next)) {
      continue;
    }

    if (
      !commitComponentAgainstSnapshot(
        commit,
        allNodes,
        i,
        currentEl,
        next,
        newChildren.length
      )
    ) {
      replaceWithFresh(commit, currentEl, next);
    }
  }
}

/**
 * Everything else: elements whose count no longer matches the parent's.
 *
 * Positions come from a snapshot of the element children taken before any of
 * them are replaced.
 */
function commitElementsByPosition(
  commit: UnkeyedCommit,
  existing: Element[],
  newChildren: unknown[]
): void {
  const { parent } = commit;
  const max = Math.max(existing.length, newChildren.length);

  for (let i = 0; i < max; i++) {
    const current = existing[i];
    const next = newChildren[i];
    const nextIsEmpty = isEmptyChild(next);

    if (nextIsEmpty && current) {
      retireNodeSubtree(current);
      current.remove();
      continue;
    }

    if (!current && !nextIsEmpty) {
      const dom = commit.domHost.createDOMNode(next, commit.parentNamespace);
      if (dom) parent.appendChild(dom);
      continue;
    }

    if (!current || nextIsEmpty) continue;

    if (isScalarChild(next)) {
      replaceWithFresh(commit, current, next);
    } else if (_isDOMElement(next)) {
      if (typeof next.type === 'string') {
        commitIntrinsicChild(commit, current, next);
      } else if (!syncComponentChild(commit, current, next)) {
        replaceOrInsertFresh(
          commit,
          current,
          next,
          () => parent.children[i] ?? null
        );
      }
    } else {
      // Namespace is deliberately not forwarded here, matching the original.
      const dom = commit.domHost.createDOMNode(next);
      if (dom) {
        retireNodeSubtree(current);
        parent.replaceChild(dom, current);
      }
    }
  }
}

/**
 * Commit an unkeyed child list by position.
 *
 * Three traversals can do this, and which one applies is decided by the shape
 * of the new list and of the parent's current children. They were previously
 * one function; each now says what it assumes.
 */
export function updateUnkeyedChildren(
  parent: Element,
  newChildren: unknown[],
  forceUpdate = false
): void {
  const commit: UnkeyedCommit = {
    parent,
    parentNamespace: getParentNamespace(parent),
    domHost: getRendererDOMHost(),
    forceUpdate,
  };

  const {
    scalar: hasText,
    element: hasElements,
    empty: hasEmptyChildren,
    component: hasComponentChildren,
  } = collectChildKinds(newChildren);
  const hasNonElementDomChildren =
    parent.childNodes.length !== parent.children.length;

  if (
    !hasEmptyChildren &&
    !hasText &&
    !hasComponentChildren &&
    !hasNonElementDomChildren &&
    hasElements &&
    parent.children.length === newChildren.length
  ) {
    commitAlignedElements(commit, newChildren);
    return;
  }

  if (
    hasText ||
    hasComponentChildren ||
    hasEmptyChildren ||
    hasNonElementDomChildren
  ) {
    commitMixedContent(commit, newChildren);
    return;
  }

  const existing = Array.from(parent.children);

  // A single text child replacing a lone text node keeps that node.
  if (
    newChildren.length === 1 &&
    existing.length === 0 &&
    parent.childNodes.length === 1
  ) {
    const firstNewChild = newChildren[0];
    const firstExisting = parent.firstChild;
    if (isScalarChild(firstNewChild) && firstExisting?.nodeType === 3) {
      (firstExisting as Text).data = String(firstNewChild);
      return;
    }
  }

  // The parent holds only non-element nodes that no new child can reuse.
  if (existing.length === 0 && parent.childNodes.length > 0) {
    for (let n = parent.firstChild; n;) {
      const next = n.nextSibling;
      retireNodeSubtree(n);
      n = next;
    }
    parent.textContent = '';
  }

  commitElementsByPosition(commit, existing, newChildren);
}
