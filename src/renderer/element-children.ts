import type { ComponentFunction } from '../runtime/component-contracts';
import { clearControlBoundaryCommitOwner } from './boundaries';
import {
  commitForBoundaryChildren,
  evaluateControlBoundaryState,
  getControlBoundaryState,
  getDirectControlBoundaryVNode,
  registerControlBoundaryCommitOwner,
  trySyncControlBoundaryChild,
} from './boundaries';
import { isBulkTextFastPathEligible, performBulkTextReplace } from './children';
import { isFragmentVNode, normalizeComponentChildren } from './child-shape';
import { teardownNodeSubtree } from './cleanup';
import { getRendererDOMHost, type ElementWithContext } from './dom-host';
import { keyedElements } from './keyed';
import { getParentNamespace } from './namespaces';
import {
  trySyncScalarChildSequenceInPlace,
  type ReactiveChildDOMHost,
} from './reactive-children';
import { reconcileKeyedChildren } from './reconcile';
import { tagsEqualIgnoreCase } from './static-reuse';
import { _isDOMElement, type DOMElement, type VNode } from './types';
import { extractKey } from './utils';

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
      const key = child.getAttribute('data-key');
      if (key !== null) {
        keyMap.set(key, child);
        const numericKey = Number(key);
        if (!Number.isNaN(numericKey)) keyMap.set(numericKey, child);
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
    currentDom: Element,
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
        if (synced && synced !== current) {
          teardownNodeSubtree(current);
        } else if (!synced) {
          const dom = domHost.createDOMNode(next, parentNamespace);
          if (dom) {
            teardownNodeSubtree(current);
            parent.replaceChild(dom, current);
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
                parent.replaceChild(dom, currentNode);
              }
            }
          } else {
            if (trySyncControlBoundaryChild(parent, currentNode, next)) {
              continue;
            }

            const synced = trySyncComponentChild(currentEl, next);
            if (synced && synced !== currentNode) {
              teardownNodeSubtree(currentEl);
            } else if (!synced) {
              const dom = domHost.createDOMNode(next, parentNamespace);
              if (dom) {
                teardownNodeSubtree(currentEl);
                parent.replaceChild(dom, currentNode);
              }
            }
          }
        } else {
          const dom = domHost.createDOMNode(next, parentNamespace);
          if (dom) parent.replaceChild(dom, currentNode);
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
        if (synced && synced !== current) {
          teardownNodeSubtree(current);
        } else if (!synced) {
          const dom = domHost.createDOMNode(next, parentNamespace);
          if (dom) {
            teardownNodeSubtree(current);
            parent.replaceChild(dom, current);
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
