import type { ComponentFunction } from '../runtime';
import { __CONTROL_BOUNDARY__ } from '../common/vnode';
import { clearControlBoundaryCommitOwner } from './boundaries';
import {
  commitForBoundaryChildren,
  evaluateControlBoundaryState,
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
  isRangeStart,
  moveRange,
  removeRange,
  type DOMRange,
} from './dom-range';

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
    for (let n = el.firstChild; n; ) {
      const next = n.nextSibling;
      teardownNodeSubtree(n);
      n = next;
    }
    el.textContent = '';
    return;
  }

  if (!Array.isArray(children) && isFragmentVNode(children)) {
    updateUnkeyedChildren(
      el,
      normalizeComponentChildren(children),
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
      for (let n = el.firstChild; n; ) {
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

    if (
      normalizedChildren.some(isControlBoundaryVNode) &&
      normalizedChildren.every((child) => {
        if (!isControlBoundaryVNode(child)) return true;
        return getControlBoundaryState(child)?.kind !== 'for';
      })
    ) {
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

  for (let n = el.firstChild; n; ) {
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

function updateMixedControlChildren(
  parent: Element,
  children: VNode[],
  forceUpdate: boolean
): void {
  const parentNamespace = getParentNamespace(parent);
  const domHost = getRendererDOMHost();
  let cursor: Node | null = parent.firstChild;

  for (const child of children) {
    if (isControlBoundaryVNode(child)) {
      const controlState = getControlBoundaryState(child);
      if (!controlState) {
        throw new Error(
          '[updateElementChildren] Control boundary missing internal state'
        );
      }

      registerControlBoundaryCommitOwner(parent, controlState);
      const childVNodes = evaluateControlBoundaryState(controlState);
      const cursorAfterBoundary = cursor
        ? isRangeStart(cursor)
          ? (findRangeEnd(cursor)?.nextSibling ?? cursor.nextSibling)
          : cursor.nextSibling
        : null;
      const ranges = syncControlBoundaryInMixedParent(
        parent,
        controlState,
        childVNodes,
        cursor
      );
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
      } else if (cursor?.parentNode !== parent) {
        cursor =
          cursorAfterBoundary?.parentNode === parent
            ? cursorAfterBoundary
            : null;
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
        forceUpdate
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
    const next = removeRangeAtCursor(parent, cursor);
    cursor = next === cursor ? cursor.nextSibling : next;
  }
}

function isEmptyChild(child: unknown): boolean {
  return child === null || child === undefined || child === false;
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
      const key = getMaterializedKey(child);
      if (key !== undefined) {
        keyMap.set(key, child);
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
    next: DOMElement
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
      forceUpdate
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
    const allNodes = Array.from(parent.childNodes);
    const max = Math.max(allNodes.length, newChildren.length);

    for (let i = 0; i < max; i++) {
      const currentNode = allNodes[i];
      const next = newChildren[i];
      const nextIsEmpty = isEmptyChild(next);

      if (nextIsEmpty && currentNode) {
        teardownNodeSubtree(currentNode);
        currentNode.remove();
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

            const synced = trySyncComponentChild(currentEl, next);
            if (!synced) {
              const dom = domHost.createDOMNode(next, parentNamespace);
              if (dom) {
                teardownNodeSubtree(currentEl);
                parent.replaceChild(dom, currentNode);
              }
            }
          }
        } else {
          if (
            typeof next.type === 'function' &&
            trySyncComponentChild(currentNode, next)
          ) {
            continue;
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
    for (let n = parent.firstChild; n; ) {
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
