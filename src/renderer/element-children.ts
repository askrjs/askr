import type { ComponentFunction } from '../runtime';
import { __CONTROL_BOUNDARY__ } from '../common/vnode';
import { isSSRPortalHydrationAnchor } from '../common/portal';
import { clearControlBoundaryCommitOwner } from './boundaries';
import {
  commitForBoundaryChildren,
  evaluateControlBoundaryState,
  getControlBoundaryRanges,
  getControlBoundaryState,
  getDirectControlBoundaryVNode,
  registerControlBoundaryCommitOwner,
  syncControlBoundaryInMixedParent,
  trySyncControlBoundaryChild,
} from './boundaries';
import { isBulkTextFastPathEligible, performBulkTextReplace } from './children';
import { isFragmentVNode, normalizeComponentChildren } from './child-shape';
import { teardownNodeSubtree } from './cleanup';
import { getRendererDOMHost, type ElementWithContext } from './dom-host';
import { keyedElements } from './keyed';
import { getMaterializedKey } from './utils';
import { getParentNamespace } from './namespaces';
import {
  trySyncScalarChildSequenceInPlace,
  type ReactiveChildDOMHost,
} from './reactive-children';
import { reconcileKeyedChildren } from './reconcile';
import { tagsEqualIgnoreCase } from './static-reuse';
import { _isDOMElement, type DOMElement, type VNode } from './types';
import { extractKey } from './utils';
import {
  createDetachedRange,
  findRangeEnd,
  getLogicalChildHosts,
  isRangeStart,
  moveRange,
  rangeContains,
  removeRange,
  type DOMRange,
} from './dom-range';
import { isHydrationAdoptionScopeActive } from './intrinsic-hydration-adoption';

export const rendererReactiveChildDOMHost: ReactiveChildDOMHost = {
  createDOMNode: (node, parentNamespace) =>
    getRendererDOMHost().createDOMNode(node, parentNamespace),
  updateElementChildren: (el, children, forceUpdate) =>
    updateElementChildren(el, children, forceUpdate),
};

export function updateElementChildren(
  el: Element,
  children: VNode | VNode[] | undefined,
  forceUpdate = false
): void {
  const directControlBoundary = getDirectControlBoundaryVNode(children);
  if (directControlBoundary) {
    const controlState = getControlBoundaryState(directControlBoundary);
    if (!controlState) {
      throw new Error(
        '[updateElementChildren] Control boundary missing internal state'
      );
    }

    registerControlBoundaryCommitOwner(el, controlState);
    const childrenVNodes = evaluateControlBoundaryState(controlState);
    commitForBoundaryChildren(el, controlState, childrenVNodes as VNode[]);
    return;
  }

  clearControlBoundaryCommitOwner(el);

  if (children === null || children === undefined) {
    keyedElements.delete(el);
    for (let n = el.firstChild; n;) {
      const next = n.nextSibling;
      teardownNodeSubtree(n);
      n = next;
    }
    el.textContent = '';
    return;
  }

  if (!Array.isArray(children) && isFragmentVNode(children)) {
    // Recurse rather than calling updateUnkeyedChildren directly: a bare
    // Fragment can wrap a control-boundary vnode (e.g. a lone <For>), and
    // only re-entering this dispatcher re-runs the control-boundary
    // detection above on the normalized array. Calling updateUnkeyedChildren
    // directly bypassed that detection and forced a full teardown/recreate
    // of the wrapped boundary's content on every update.
    updateElementChildren(
      el,
      normalizeComponentChildren(children) as VNode[],
      forceUpdate
    );
    return;
  }

  if (
    !Array.isArray(children) &&
    (typeof children === 'string' || typeof children === 'number')
  ) {
    if (el.childNodes.length === 1 && el.firstChild?.nodeType === 3) {
      const s = String(children);
      const t = el.firstChild as Text;
      if (t.data !== s) t.data = s;
    } else {
      for (let n = el.firstChild; n;) {
        const next = n.nextSibling;
        teardownNodeSubtree(n);
        n = next;
      }
      el.textContent = String(children);
    }
    return;
  }

  if (Array.isArray(children)) {
    const normalizedChildren = normalizeComponentChildren(children) as VNode[];

    if (
      trySyncScalarChildSequenceInPlace(
        el,
        normalizedChildren,
        rendererReactiveChildDOMHost
      )
    ) {
      keyedElements.delete(el);
      return;
    }

    if (normalizedChildren.some(isControlBoundaryVNode)) {
      updateMixedControlChildren(el, normalizedChildren, forceUpdate);
      keyedElements.delete(el);
      return;
    }

    if (hasKeyedVNodeChildren(normalizedChildren)) {
      const oldKeyMap = getOrBuildDomKeyMap(el);
      const newKeyMap = reconcileKeyedChildren(
        el,
        normalizedChildren,
        oldKeyMap
      );
      keyedElements.set(el, newKeyMap);
      return;
    }
    if (isBulkTextFastPathEligible(el, normalizedChildren)) {
      performBulkTextReplace(el, normalizedChildren);
      keyedElements.delete(el);
      return;
    }
    updateUnkeyedChildren(el, normalizedChildren, forceUpdate);
    return;
  }

  if (_isDOMElement(children)) {
    updateUnkeyedChildren(el, [children], forceUpdate);
    return;
  }

  for (let n = el.firstChild; n;) {
    const next = n.nextSibling;
    teardownNodeSubtree(n);
    n = next;
  }
  el.textContent = '';
  const dom = getRendererDOMHost().createDOMNode(children);
  if (dom) el.appendChild(dom);
}

function hasKeyedVNodeChildren(children: VNode[]): boolean {
  for (let i = 0; i < children.length; i++) {
    if (extractKey(children[i]) !== undefined) return true;
  }
  return false;
}

function isControlBoundaryVNode(child: VNode): child is DOMElement {
  return _isDOMElement(child) && child.type === __CONTROL_BOUNDARY__;
}

function removeRangeAtCursor(parent: Element, cursor: Node): Node | null {
  if (!isRangeStart(cursor)) {
    return cursor;
  }

  const end = findRangeEnd(cursor);
  if (!end) {
    return cursor;
  }

  const range: DOMRange = { start: cursor, end, single: false };
  const next = end.nextSibling;
  removeRange(range, (node) => {
    if (node === range.start || node === range.end) {
      node.parentNode?.removeChild(node);
      return;
    }
    teardownNodeSubtree(node);
    node.parentNode?.removeChild(node);
  });
  return next;
}

function consumeUnmatchedTailAtCursor(
  parent: Element,
  cursor: Node
): Node | null {
  const instanceHost = cursor as Node & {
    __ASKR_INSTANCE?: unknown;
    __ASKR_INSTANCES?: unknown[];
  };
  if (
    isSSRPortalHydrationAnchor(cursor) &&
    (isHydrationAdoptionScopeActive() ||
      Boolean(instanceHost.__ASKR_INSTANCE) ||
      Boolean(instanceHost.__ASKR_INSTANCES?.length))
  ) {
    return cursor.nextSibling;
  }

  if (isRangeStart(cursor)) {
    const next = removeRangeAtCursor(parent, cursor);
    if (next !== cursor) return next;
  }

  const next = cursor.nextSibling;
  teardownNodeSubtree(cursor);
  if (cursor.parentNode === parent) {
    parent.removeChild(cursor);
  }
  return next;
}

function nodeMatchesFollowingVNode(node: Node, vnode: VNode): boolean {
  if (typeof vnode === 'string' || typeof vnode === 'number') {
    return node.nodeType === Node.TEXT_NODE;
  }
  if (!_isDOMElement(vnode)) return false;
  if (typeof vnode.type === 'string') {
    if (
      !(node instanceof Element) ||
      !tagsEqualIgnoreCase(node.tagName, vnode.type)
    ) {
      return false;
    }
    const key = extractKey(vnode);
    return key === undefined || getMaterializedKey(node) === key;
  }
  if (typeof vnode.type === 'function') {
    const host = node as Node & {
      __ASKR_INSTANCE?: { fn?: ComponentFunction };
      __ASKR_INSTANCES?: Array<{ fn?: ComponentFunction }>;
    };
    return (
      host.__ASKR_INSTANCE?.fn === vnode.type ||
      host.__ASKR_INSTANCES?.some((instance) => instance.fn === vnode.type) ===
        true
    );
  }
  return false;
}

function alignCursorToFollowingVNode(
  parent: Element,
  cursor: Node,
  vnode: VNode
): Node {
  let matching: Node | null = cursor;
  while (matching && !nodeMatchesFollowingVNode(matching, vnode)) {
    matching = isRangeStart(matching)
      ? (findRangeEnd(matching)?.nextSibling ?? matching.nextSibling)
      : matching.nextSibling;
  }
  if (!matching) return cursor;

  let next: Node | null = cursor;
  while (next && next !== matching) {
    next = consumeUnmatchedTailAtCursor(parent, next);
  }
  return matching;
}

export function updateMixedControlChildren(
  parent: Element,
  children: VNode[],
  forceUpdate: boolean
): void {
  clearControlBoundaryCommitOwner(parent);
  const parentNamespace = getParentNamespace(parent);
  const domHost = getRendererDOMHost();
  let cursor: Node | null = parent.firstChild;

  for (let childIndex = 0; childIndex < children.length; childIndex += 1) {
    const child = children[childIndex];
    if (isEmptyChild(child)) {
      continue;
    }
    if (isControlBoundaryVNode(child)) {
      const controlState = getControlBoundaryState(child);
      if (!controlState) {
        throw new Error(
          '[updateElementChildren] Control boundary missing internal state'
        );
      }

      const childVNodes = evaluateControlBoundaryState(controlState);

      if (controlState.kind === 'for') {
        const currentRanges = getControlBoundaryRanges(controlState);
        const hydrationOwnsCursor =
          isHydrationAdoptionScopeActive() &&
          (controlState.orderedKeys.length > 0
            ? controlState.orderedItems.some(
                (item) => item?.scope.hydrationPending
              )
            : Boolean(controlState.fallbackScope?.hydrationPending));
        const boundaryOwnsCursor =
          cursor !== null &&
          (hydrationOwnsCursor ||
            currentRanges.some((range) => rangeContains(range, cursor!)) ||
            controlState.lastRemovedRanges.some((range) =>
              rangeContains(range, cursor!)
            ) ||
            controlState.lastRemovedNodes.includes(cursor));
        if (cursor && !boundaryOwnsCursor) {
          const following = children
            .slice(childIndex + 1)
            .find(
              (candidate) =>
                !isEmptyChild(candidate) && !isControlBoundaryVNode(candidate)
            );
          if (following !== undefined) {
            cursor = alignCursorToFollowingVNode(parent, cursor, following);
          }
        }
      }

      const cursorAfterBoundary = cursor
        ? isRangeStart(cursor)
          ? (findRangeEnd(cursor)?.nextSibling ?? cursor.nextSibling)
          : cursor.nextSibling
        : null;
      const [ranges, postBoundaryCursor] = syncControlBoundaryInMixedParent(
        parent,
        controlState,
        childVNodes,
        cursor
      );
      if (controlState.kind === 'for') {
        cursor = postBoundaryCursor;
        continue;
      }
      for (const range of ranges) {
        if (range.start.parentNode !== parent) {
          moveRange(
            parent,
            range,
            cursor?.parentNode === parent ? cursor : null
          );
        } else if (cursor?.parentNode === parent) {
          moveRange(parent, range, cursor);
        }
      }

      const last = ranges[ranges.length - 1];
      if (last) {
        const cursorWasReplaced =
          cursor && !ranges.some((range) => range.start === cursor);
        if (!cursor?.parentNode) {
          cursor = last.end.nextSibling;
        } else if (cursorWasReplaced && isRangeStart(cursor)) {
          const oldEnd = findRangeEnd(cursor);
          cursor = oldEnd?.nextSibling ?? last.end.nextSibling;
        } else if (isRangeStart(cursor)) {
          const oldEnd = findRangeEnd(cursor);
          cursor = oldEnd?.nextSibling ?? last.end.nextSibling;
        } else {
          cursor = last.end.nextSibling;
        }
      } else {
        const inactiveBoundaryCursor =
          cursor?.parentNode === parent
            ? cursor
            : cursorAfterBoundary?.parentNode === parent
              ? cursorAfterBoundary
              : null;
        const inactiveBoundaryEnd =
          inactiveBoundaryCursor && isRangeStart(inactiveBoundaryCursor)
            ? findRangeEnd(inactiveBoundaryCursor)
            : null;
        cursor =
          inactiveBoundaryEnd?.previousSibling === inactiveBoundaryCursor
            ? inactiveBoundaryEnd.nextSibling
            : inactiveBoundaryCursor;
      }
      continue;
    }

    if (cursor) {
      cursor = removeRangeAtCursor(parent, cursor);
    }

    if (
      cursor &&
      (typeof child === 'string' || typeof child === 'number') &&
      cursor.nodeType === 3
    ) {
      (cursor as Text).data = String(child);
      cursor = cursor.nextSibling;
      continue;
    }

    if (
      cursor instanceof Element &&
      _isDOMElement(child) &&
      typeof child.type === 'string' &&
      tagsEqualIgnoreCase(cursor.tagName, child.type)
    ) {
      domHost.updateElementFromVnode(cursor, child, true, forceUpdate);
      cursor = cursor.nextSibling;
      continue;
    }

    if (cursor && _isDOMElement(child) && typeof child.type === 'function') {
      const synced = domHost.syncComponentElement(
        cursor,
        child as unknown as ElementWithContext,
        child.type as ComponentFunction,
        ((child.props ?? {}) as Record<string, unknown>) || {},
        parentNamespace,
        forceUpdate,
        undefined,
        undefined,
        true
      );
      if (synced) {
        cursor = synced.nextSibling;
        continue;
      }
    }

    const created = domHost.createDOMNode(child, parentNamespace);
    if (!created) {
      cursor = cursor?.nextSibling ?? null;
      continue;
    }

    const materialized = createDetachedRange(created);
    const old = cursor;
    moveRange(parent, materialized.range, old);
    if (old) {
      teardownNodeSubtree(old);
      old.parentNode?.removeChild(old);
    }
    cursor = materialized.range.end.nextSibling;
  }

  while (cursor) {
    cursor = consumeUnmatchedTailAtCursor(parent, cursor);
  }
}

function isEmptyChild(child: unknown): boolean {
  return child === null || child === undefined || child === false;
}

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

function getOrBuildDomKeyMap(
  parent: Element
): Map<string | number, Element> | undefined {
  let keyMap = keyedElements.get(parent);
  if (!keyMap) {
    keyMap = new Map<string | number, Element>();
    for (const host of getLogicalChildHosts(parent)) {
      if (!(host instanceof Element)) continue;
      const key = getMaterializedKey(host);
      if (key !== undefined) {
        keyMap.set(key, host);
      }
    }
    if (keyMap.size > 0) keyedElements.set(parent, keyMap);
  }
  return keyMap.size > 0 ? keyMap : undefined;
}

export function updateUnkeyedChildren(
  parent: Element,
  newChildren: unknown[],
  forceUpdate = false
): void {
  const parentNamespace = getParentNamespace(parent);
  const domHost = getRendererDOMHost();

  const trySyncComponentChild = (
    currentDom: Node,
    next: DOMElement,
    hydrationRangeEnd?: Node | null
  ): Node | null => {
    if (typeof next.type !== 'function') {
      return null;
    }

    return domHost.syncComponentElement(
      currentDom,
      next as ElementWithContext,
      next.type as ComponentFunction,
      (((next as DOMElement).props ?? {}) as Record<string, unknown>) || {},
      parentNamespace,
      forceUpdate,
      undefined,
      hydrationRangeEnd,
      true
    );
  };

  const hasText = newChildren.some(
    (c) => typeof c === 'string' || typeof c === 'number'
  );
  const hasElements = newChildren.some((c) => _isDOMElement(c));
  const hasEmptyChildren = newChildren.some(isEmptyChild);
  const hasComponentChildren = newChildren.some(
    (c) => _isDOMElement(c) && typeof (c as DOMElement).type === 'function'
  );
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
    const c = parent.children;
    for (let i = 0; i < newChildren.length; i++) {
      const next = newChildren[i];
      const current = c[i];
      if (!current || next === undefined) continue;
      if (_isDOMElement(next) && typeof next.type === 'string') {
        if (tagsEqualIgnoreCase(current.tagName, next.type)) {
          domHost.updateElementFromVnode(current, next, true, forceUpdate);
        } else {
          const dom = domHost.createDOMNode(next, parentNamespace);
          if (dom) {
            teardownNodeSubtree(current);
            parent.replaceChild(dom, current);
          }
        }
      } else if (_isDOMElement(next)) {
        if (trySyncControlBoundaryChild(parent, current, next)) {
          continue;
        }

        const synced = trySyncComponentChild(current, next);
        if (!synced) {
          const dom = domHost.createDOMNode(next, parentNamespace);
          if (dom) {
            teardownNodeSubtree(current);
            if (current.parentNode === parent) {
              parent.replaceChild(dom, current);
            } else if (dom.parentNode !== parent) {
              parent.insertBefore(dom, parent.children[i] ?? null);
            }
          }
        }
      } else {
        const dom = domHost.createDOMNode(next, parentNamespace);
        if (dom) {
          teardownNodeSubtree(current);
          parent.replaceChild(dom, current);
        }
      }
    }
    return;
  }

  const existing = Array.from(parent.children);

  if (
    hasText ||
    hasComponentChildren ||
    hasEmptyChildren ||
    hasNonElementDomChildren
  ) {
    const allNodes: Node[] = Array.from(parent.childNodes);
    for (let i = 0; i < Math.max(allNodes.length, newChildren.length); i += 1) {
      const currentNode = allNodes[i];
      const next = newChildren[i];
      const nextIsEmpty = isEmptyChild(next);

      if (nextIsEmpty && currentNode) {
        teardownNodeSubtree(currentNode);
        currentNode.parentNode?.removeChild(currentNode);
        continue;
      }

      if (!currentNode && !nextIsEmpty) {
        const dom = domHost.createDOMNode(next, parentNamespace);
        if (dom) parent.appendChild(dom);
        continue;
      }

      if (!currentNode || nextIsEmpty) continue;

      if (typeof next === 'string' || typeof next === 'number') {
        if (currentNode.nodeType === 3) {
          (currentNode as Text).data = String(next);
        } else {
          const textNode = document.createTextNode(String(next));
          teardownNodeSubtree(currentNode);
          parent.replaceChild(textNode, currentNode);
        }
      } else if (_isDOMElement(next)) {
        if (currentNode.nodeType === 1) {
          const currentEl = currentNode as Element;
          if (typeof next.type === 'string') {
            if (tagsEqualIgnoreCase(currentEl.tagName, next.type)) {
              domHost.updateElementFromVnode(
                currentEl,
                next,
                true,
                forceUpdate
              );
            } else {
              const dom = domHost.createDOMNode(next, parentNamespace);
              if (dom) {
                teardownNodeSubtree(currentEl);
                if (currentNode.parentNode === parent) {
                  parent.replaceChild(dom, currentNode);
                } else if (dom.parentNode !== parent) {
                  parent.insertBefore(dom, parent.childNodes[i] ?? null);
                }
              }
            }
          } else {
            if (trySyncControlBoundaryChild(parent, currentNode, next)) {
              continue;
            }

            const remainingExpected = newChildren.length - i - 1;
            const hydrationRangeEndIndex = allNodes.length - remainingExpected;
            const hydrationRangeEnd =
              hydrationRangeEndIndex > i
                ? (allNodes[hydrationRangeEndIndex] ?? null)
                : undefined;
            const synced = trySyncComponentChild(
              currentEl,
              next,
              hydrationRangeEnd
            );
            if (synced && isRangeStart(synced)) {
              replaceHydratedRangeInSnapshot(
                allNodes,
                i,
                synced,
                hydrationRangeEndIndex
              );
              continue;
            }
            if (
              synced &&
              synced !== currentNode &&
              synced.nextSibling === currentNode
            ) {
              allNodes.splice(i, 0, synced);
              continue;
            }
            if (!synced) {
              const dom = domHost.createDOMNode(next, parentNamespace);
              if (dom) {
                teardownNodeSubtree(currentEl);
                parent.replaceChild(dom, currentNode);
              }
            }
          }
        } else {
          if (typeof next.type === 'function') {
            const remainingExpected = newChildren.length - i - 1;
            const hydrationRangeEndIndex = allNodes.length - remainingExpected;
            const hydrationRangeEnd =
              hydrationRangeEndIndex > i
                ? (allNodes[hydrationRangeEndIndex] ?? null)
                : undefined;
            const synced = trySyncComponentChild(
              currentNode,
              next,
              hydrationRangeEnd
            );
            if (synced && isRangeStart(synced)) {
              replaceHydratedRangeInSnapshot(
                allNodes,
                i,
                synced,
                hydrationRangeEndIndex
              );
              continue;
            }
            if (
              synced &&
              synced !== currentNode &&
              synced.nextSibling === currentNode
            ) {
              allNodes.splice(i, 0, synced);
              continue;
            }
            if (synced) {
              continue;
            }
          }
          const dom = domHost.createDOMNode(next, parentNamespace);
          if (dom) {
            teardownNodeSubtree(currentNode);
            parent.replaceChild(dom, currentNode);
          }
        }
      }
    }
    return;
  }

  if (
    newChildren.length === 1 &&
    existing.length === 0 &&
    parent.childNodes.length === 1
  ) {
    const firstNewChild = newChildren[0];
    const firstExisting = parent.firstChild;
    if (
      (typeof firstNewChild === 'string' ||
        typeof firstNewChild === 'number') &&
      firstExisting?.nodeType === 3
    ) {
      (firstExisting as Text).data = String(firstNewChild);
      return;
    }
  }

  if (existing.length === 0 && parent.childNodes.length > 0) {
    for (let n = parent.firstChild; n;) {
      const next = n.nextSibling;
      teardownNodeSubtree(n);
      n = next;
    }
    parent.textContent = '';
  }
  const max = Math.max(existing.length, newChildren.length);

  for (let i = 0; i < max; i++) {
    const current = existing[i];
    const next = newChildren[i];
    const nextIsEmpty = isEmptyChild(next);

    if (nextIsEmpty && current) {
      teardownNodeSubtree(current);
      current.remove();
      continue;
    }

    if (!current && !nextIsEmpty) {
      const dom = domHost.createDOMNode(next, parentNamespace);
      if (dom) parent.appendChild(dom);
      continue;
    }

    if (!current || nextIsEmpty) continue;

    if (typeof next === 'string' || typeof next === 'number') {
      const textNode = document.createTextNode(String(next));
      teardownNodeSubtree(current);
      parent.replaceChild(textNode, current);
    } else if (_isDOMElement(next)) {
      if (typeof next.type === 'string') {
        if (tagsEqualIgnoreCase(current.tagName, next.type)) {
          domHost.updateElementFromVnode(current, next, true, forceUpdate);
        } else {
          const dom = domHost.createDOMNode(next, parentNamespace);
          if (dom) {
            teardownNodeSubtree(current);
            parent.replaceChild(dom, current);
          }
        }
      } else {
        const synced = trySyncComponentChild(current, next);
        if (!synced) {
          const dom = domHost.createDOMNode(next, parentNamespace);
          if (dom) {
            teardownNodeSubtree(current);
            if (current.parentNode === parent) {
              parent.replaceChild(dom, current);
            } else if (dom.parentNode !== parent) {
              parent.insertBefore(dom, parent.children[i] ?? null);
            }
          }
        }
      }
    } else {
      const dom = domHost.createDOMNode(next);
      if (dom) {
        teardownNodeSubtree(current);
        parent.replaceChild(dom, current);
      }
    }
  }
}
