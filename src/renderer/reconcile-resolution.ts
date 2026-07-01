import { __FOR_BOUNDARY__ } from '../common/vnode';
import type { Props } from '../common/props';
import type { ComponentFunction } from '../runtime/component-contracts';
import {
  evaluateCaseState,
  evaluateShowState,
  type ControlBoundaryState,
} from '../runtime/control';
import { evaluateForState } from '../runtime/for';
import { getRendererDOMHost, type ElementWithContext } from './dom-host';
import {
  canReuseIntrinsicElementInNamespace,
  getParentNamespace,
} from './namespaces';
import type { DOMElement, VNode } from './types';
import { extractKey } from './utils';

type VnodeObj = VNode & { type?: unknown; props?: Record<string, unknown> };
type ComponentVNode = DOMElement & { type: ComponentFunction };

export function createOldElResolver(
  parent: Element,
  oldKeyMap: Map<string | number, Element> | undefined,
  usedOldEls: WeakSet<Node>
): (k: string | number) => Element | undefined {
  return (k: string | number) => {
    if (!oldKeyMap) return undefined;

    const direct = oldKeyMap.get(k);
    if (direct && !usedOldEls.has(direct)) {
      usedOldEls.add(direct);
      return direct;
    }

    const s = String(k);
    const byString = oldKeyMap.get(s);
    if (byString && !usedOldEls.has(byString)) {
      usedOldEls.add(byString);
      return byString;
    }

    const n = Number(s);
    if (!Number.isNaN(n)) {
      const byNum = oldKeyMap.get(n);
      if (byNum && !usedOldEls.has(byNum)) {
        usedOldEls.add(byNum);
        return byNum;
      }
    }

    return scanForElementByKey(parent, k, s, usedOldEls);
  };
}

function scanForElementByKey(
  parent: Element,
  k: string | number,
  keyStr: string,
  usedOldEls: WeakSet<Node>
): Element | undefined {
  try {
    for (let ch = parent.firstElementChild; ch; ch = ch.nextElementSibling) {
      if (usedOldEls.has(ch)) continue;
      const attr = ch.getAttribute('data-key');
      if (attr === keyStr) {
        usedOldEls.add(ch);
        return ch;
      }
      if (attr !== null) {
        const numAttr = Number(attr);
        if (!Number.isNaN(numAttr) && numAttr === (k as number)) {
          usedOldEls.add(ch);
          return ch;
        }
      }
    }
  } catch {
    // Ignore.
  }
  return undefined;
}

export function reconcileSingleChild(
  child: VNode,
  index: number,
  parent: Element,
  resolveOldElOnce: (k: string | number) => Element | undefined,
  resolveUnkeyedOnce: () => Element | undefined,
  usedOldEls: WeakSet<Node>,
  newKeyMap: Map<string | number, Element>
): Node | null {
  const resolvedControlBoundary = prepareControlBoundaryResolution(child);
  if (resolvedControlBoundary !== null) {
    if (resolvedControlBoundary.remount) {
      return getRendererDOMHost().createDOMNode(
        resolvedControlBoundary.vnode,
        getParentNamespace(parent)
      );
    }

    return reconcileSingleChild(
      resolvedControlBoundary.vnode,
      index,
      parent,
      resolveOldElOnce,
      resolveUnkeyedOnce,
      usedOldEls,
      newKeyMap
    );
  }

  const key = extractKey(child);

  if (key !== undefined) {
    return reconcileKeyedChild(child, key, parent, resolveOldElOnce, newKeyMap);
  }

  return reconcileUnkeyedChild(
    child,
    index,
    parent,
    resolveUnkeyedOnce,
    usedOldEls
  );
}

function reconcileKeyedChild(
  child: VNode,
  key: string | number,
  parent: Element,
  resolveOldElOnce: (k: string | number) => Element | undefined,
  newKeyMap: Map<string | number, Element>
): Node | null {
  const el = resolveOldElOnce(key);
  const parentNamespace = getParentNamespace(parent);
  const domHost = getRendererDOMHost();

  if (el && el.parentElement === parent) {
    try {
      const childObj = child as VnodeObj;
      if (
        childObj &&
        typeof childObj === 'object' &&
        typeof childObj.type === 'string'
      ) {
        if (
          canReuseIntrinsicElementInNamespace(
            el,
            childObj.type,
            parentNamespace
          )
        ) {
          domHost.updateElementFromVnode(el, child);
          newKeyMap.set(key, el);
          return el;
        }
      }
      if (isComponentVNode(child)) {
        const synced = domHost.syncComponentElement(
          el,
          child as unknown as ElementWithContext,
          child.type,
          ((child.props ?? {}) as Props) || {},
          parentNamespace
        );
        if (synced) {
          if (synced instanceof Element) newKeyMap.set(key, synced);
          return synced;
        }
      }
    } catch {
      // Fall through to replacement.
    }
  }

  const dom = domHost.createDOMNode(child, parentNamespace);
  if (dom) {
    if (dom instanceof Element) newKeyMap.set(key, dom);
    return dom;
  }

  return null;
}

function reconcileUnkeyedChild(
  child: VNode,
  index: number,
  parent: Element,
  resolveUnkeyedOnce: () => Element | undefined,
  usedOldEls: WeakSet<Node>
): Node | null {
  const parentNamespace = getParentNamespace(parent);
  const domHost = getRendererDOMHost();

  try {
    const existing = parent.childNodes[index] as Node | undefined;

    if (typeof child === 'string' || typeof child === 'number') {
      if (existing && existing.nodeType === 3) {
        (existing as Text).data = String(child);
        usedOldEls.add(existing);
        return existing;
      }
      return domHost.createDOMNode(child, parentNamespace);
    }

    if (existing instanceof Element) {
      const synced = trySyncComponentChild(
        existing,
        child,
        usedOldEls,
        parentNamespace
      );
      if (synced) return synced;
    }

    if (
      existing instanceof Element &&
      canReuseElement(existing, child, parentNamespace)
    ) {
      domHost.updateElementFromVnode(existing, child);
      usedOldEls.add(existing);
      return existing;
    }

    const avail = resolveUnkeyedOnce();
    if (avail) {
      const reuseResult = tryReuseElement(
        avail,
        child,
        usedOldEls,
        parentNamespace
      );
      if (reuseResult) return reuseResult;
    }
  } catch {
    // Fall through to create new.
  }

  return domHost.createDOMNode(child, parentNamespace);
}

function isComponentVNode(child: VNode): child is ComponentVNode {
  return (
    typeof child === 'object' &&
    child !== null &&
    'type' in child &&
    typeof (child as VnodeObj).type === 'function'
  );
}

function isControlBoundaryVNode(child: VNode): child is DOMElement {
  return (
    typeof child === 'object' &&
    child !== null &&
    'type' in child &&
    (child as VnodeObj).type === __FOR_BOUNDARY__
  );
}

function prepareControlBoundaryResolution(child: VNode): {
  remount: boolean;
  vnode: VNode | null;
} | null {
  if (!isControlBoundaryVNode(child)) {
    return null;
  }

  const controlState = child._controlState ?? child._forState;
  if (!controlState) {
    return null;
  }
  if (controlState.kind === 'for') {
    const childrenVNodes = evaluateControlBoundaryChildren(controlState);
    return childrenVNodes.length === 1
      ? { remount: false, vnode: childrenVNodes[0] ?? null }
      : null;
  }

  const previousActiveKey = controlState.activeKey;
  const childrenVNodes = evaluateControlBoundaryChildren(controlState);

  return {
    remount:
      previousActiveKey !== null &&
      controlState.activeKey !== previousActiveKey,
    vnode: childrenVNodes[0] ?? null,
  };
}

function evaluateControlBoundaryChildren(
  controlState: ControlBoundaryState
): VNode[] {
  if (controlState.kind === 'for') {
    return evaluateForState(controlState);
  }

  if (controlState.kind === 'show') {
    return evaluateShowState(controlState);
  }

  return evaluateCaseState(controlState);
}

function trySyncComponentChild(
  existing: Element,
  child: VNode,
  usedOldEls: WeakSet<Node>,
  parentNamespace: string | undefined
): Node | null {
  if (!isComponentVNode(child)) return null;

  const synced = getRendererDOMHost().syncComponentElement(
    existing,
    child as unknown as ElementWithContext,
    child.type,
    ((child.props ?? {}) as Props) || {},
    parentNamespace
  );
  if (!synced) return null;

  usedOldEls.add(existing);
  usedOldEls.add(synced);
  return synced;
}

function canReuseElement(
  existing: Element | undefined,
  child: VNode,
  parentNamespace: string | undefined
): boolean {
  if (!existing) return false;
  if (typeof child !== 'object' || child === null || !('type' in child))
    return false;

  const childObj = child as VnodeObj;
  const existingKey = existing.getAttribute('data-key');
  const hasNoKey = existingKey === null || existingKey === undefined;

  return (
    hasNoKey &&
    typeof childObj.type === 'string' &&
    canReuseIntrinsicElementInNamespace(
      existing,
      childObj.type,
      parentNamespace
    )
  );
}

export function collectUnkeyedElements(parent: Element): Element[] {
  const elements: Element[] = [];
  for (let ch = parent.firstElementChild; ch; ch = ch.nextElementSibling) {
    if (ch.getAttribute('data-key') === null) elements.push(ch);
  }
  return elements;
}

function tryReuseElement(
  avail: Element,
  child: VNode,
  usedOldEls: WeakSet<Node>,
  parentNamespace: string | undefined
): Node | null {
  if (typeof child === 'string' || typeof child === 'number') {
    return null;
  }

  const synced = trySyncComponentChild(
    avail,
    child,
    usedOldEls,
    parentNamespace
  );
  if (synced) {
    return synced;
  }

  if (typeof child === 'object' && child !== null && 'type' in child) {
    const childObj = child as VnodeObj;
    if (
      typeof childObj.type === 'string' &&
      canReuseIntrinsicElementInNamespace(avail, childObj.type, parentNamespace)
    ) {
      getRendererDOMHost().updateElementFromVnode(avail, child);
      usedOldEls.add(avail);
      return avail;
    }
  }

  return null;
}
