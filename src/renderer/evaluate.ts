import { getRuntimeEnv } from './env';
import type { ComponentFunction, ComponentInstance } from '../runtime';
import { removeAllListeners } from './cleanup';
import { createDOMNode, syncComponentElement } from './dom';
import type { ElementWithContext } from './dom-host';
import {
  cleanupRangeNode,
  createDOMRange,
  hasDOMRange,
  updateDOMRangeForContext,
} from './evaluate-dom-range';
import {
  getFragmentChildren,
  getRetainedHostOwnerChain,
  isFragment,
  processFragmentChildren,
  retainHostOwnerChain,
  smartUpdateElement,
  tagNamesEqualIgnoreCase,
  tryFirstRenderKeyedChildren,
  updateElementChildren,
  updateForBoundaryChildren,
} from './evaluate-reconcile';
import { _isDOMElement, type DOMElement } from './types';
import { __FOR_BOUNDARY__ } from '../common/vnode';

export { clearDOMRange } from './evaluate-dom-range';

export const IS_DOM_AVAILABLE = typeof document !== 'undefined';

export function evaluate(
  node: unknown,
  target: Element | null,
  context?: object,
  retainedOwner?: ComponentInstance
): void {
  if (!target) return;
  if (typeof document === 'undefined') {
    if (getRuntimeEnv().NODE_ENV !== 'production') {
      try {
        console.warn('[Askr] evaluate() called in non-DOM environment; no-op.');
      } catch (e) {
        void e;
      }
    }
    return;
  }

  if (context && hasDOMRange(context)) {
    const normalizedChildren =
      node === null || node === undefined || node === false
        ? []
        : isFragment(node)
          ? getFragmentChildren(node as DOMElement)
          : Array.isArray(node)
            ? node
            : [node];

    updateDOMRangeForContext(target, context, normalizedChildren);
  } else if (context) {
    createDOMRange(target, context, node);
  } else {
    let vnode = node;

    if (isFragment(vnode)) {
      const childArray = getFragmentChildren(vnode as DOMElement);
      if (
        childArray.length === 1 &&
        _isDOMElement(childArray[0]) &&
        typeof (childArray[0] as DOMElement).type === 'string'
      ) {
        vnode = childArray[0];
      } else {
        processFragmentChildren(target, childArray, cleanupRangeNode);
        return;
      }
    }

    if (
      _isDOMElement(vnode) &&
      (vnode as DOMElement).type === __FOR_BOUNDARY__
    ) {
      updateForBoundaryChildren(target, vnode as DOMElement);
      return;
    }

    if (Array.isArray(vnode)) {
      updateElementChildren(target, vnode, cleanupRangeNode);
      return;
    }

    const targetWithInstance = target as Element & {
      __ASKR_INSTANCE?: ComponentInstance;
    };
    const targetInstance =
      retainedOwner?.target === target
        ? retainedOwner
        : targetWithInstance.__ASKR_INSTANCE;
    if (targetInstance && targetInstance.target === target) {
      const retainedHostInstances = getRetainedHostOwnerChain(
        targetWithInstance,
        targetInstance
      );

      if (_isDOMElement(vnode) && typeof vnode.type === 'function') {
        const syncedDom = syncComponentElement(
          target,
          vnode as unknown as ElementWithContext,
          vnode.type as ComponentFunction,
          (((vnode as DOMElement).props ?? {}) as Record<string, unknown>) ||
            {},
          undefined,
          false,
          retainedHostInstances
        );

        if (syncedDom instanceof Element) {
          retainHostOwnerChain(
            syncedDom,
            targetInstance,
            retainedHostInstances
          );
          targetInstance.target = syncedDom;
          return;
        }
      }

      if (
        _isDOMElement(vnode) &&
        typeof vnode.type === 'string' &&
        tagNamesEqualIgnoreCase(target.tagName, vnode.type)
      ) {
        smartUpdateElement(target, vnode as DOMElement, cleanupRangeNode);
        return;
      }

      const newDom = createDOMNode(vnode);
      if (newDom && target.parentNode) {
        if (newDom instanceof Element) {
          (
            newDom as Element & { __ASKR_INSTANCE?: ComponentInstance }
          ).__ASKR_INSTANCE = targetInstance;
          targetInstance.target = newDom as Element;
        }
        removeAllListeners(target);
        target.parentNode.replaceChild(newDom, target);
        return;
      }
    }

    const firstChild = target.children[0] as Element | undefined;

    if (
      firstChild &&
      _isDOMElement(vnode) &&
      typeof vnode.type === 'string' &&
      tagNamesEqualIgnoreCase(firstChild.tagName, vnode.type)
    ) {
      smartUpdateElement(firstChild, vnode as DOMElement, cleanupRangeNode);
    } else {
      for (let node = target.firstChild; node; ) {
        const next = node.nextSibling;
        cleanupRangeNode(node);
        node = next;
      }
      target.textContent = '';

      if (
        _isDOMElement(vnode) &&
        typeof vnode.type === 'string' &&
        tryFirstRenderKeyedChildren(target, vnode as DOMElement)
      ) {
        return;
      }

      const dom = createDOMNode(vnode);
      if (dom) {
        target.appendChild(dom);
      }
    }
  }
}
