import { logger } from '../dev/logger';
import type { ComponentFunction } from '../runtime/component';
import {
  clearCaseDomUpdateState,
  clearShowDomUpdateState,
  evaluateCaseState,
  evaluateShowState,
  type ControlBoundaryState,
} from '../runtime/control';
import {
  clearForDomUpdateState,
  evaluateForState,
  recordBenchEvent,
} from '../runtime/for';
import type { ComponentInstance } from '../runtime/component';
import { teardownNodeSubtree } from './cleanup';
import { keyedElements } from './keyed';
import { commitForStateBoundaryChildren } from './for-commit';
import { getRuntimeEnv } from './env';
import { _isDOMElement, type DOMElement, type VNode } from './types';
import { tagNamesEqualIgnoreCase } from './utils';
import {
  createDOMNode,
  syncComponentElement,
  updateElementFromVnode,
  tryPatchStableForDirtyItem,
} from './dom';

type ElementWithContext = DOMElement & {
  __instance?: ComponentInstance;
};

function checkVNodeShapeChanged(dom: Node, vnode: VNode): boolean {
  if (!_isDOMElement(vnode)) return true;
  if (!(dom instanceof Element)) return true;
  const vnodeType = (vnode as DOMElement).type;
  if (typeof vnodeType !== 'string') return true;
  return dom.tagName.toLowerCase() !== vnodeType.toLowerCase();
}

function materializeChildScopeDom(vnode: VNode): Node | null {
  if (vnode === null || vnode === undefined || vnode === false) {
    return document.createComment('');
  }

  const dom = createDOMNode(vnode);
  if (!(dom instanceof DocumentFragment)) {
    return dom;
  }

  const firstChild = dom.firstChild;
  const secondChild = firstChild?.nextSibling ?? null;
  if (!firstChild) {
    return document.createComment('');
  }
  if (secondChild) {
    throw new Error('[askr] Child scopes must render a single DOM root node.');
  }
  return firstChild;
}

export function evaluateControlBoundaryState(
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

function clearControlBoundaryDomUpdateState(
  controlState: ControlBoundaryState
): void {
  if (controlState.kind === 'for') {
    clearForDomUpdateState(controlState);
    return;
  }
  if (controlState.kind === 'show') {
    clearShowDomUpdateState(controlState);
    return;
  }
  clearCaseDomUpdateState(controlState);
}

export function getControlBoundaryState(
  node: DOMElement
): ControlBoundaryState | null {
  return (
    node._controlState ??
    (node._forState as ControlBoundaryState | undefined) ??
    null
  );
}

/**
 * Create DOM from For boundary - evaluates list and renders items
 *
 * CRITICAL INVARIANT:
 * DOM order MUST be reconstructed from the current vnode list on every render.
 * Reusing DOM nodes never implies preserving their position.
 *
 * This function ALWAYS returns a fragment whose child order exactly matches
 * the evaluated vnode list, even when all DOM nodes are reused.
 * Appending an existing node to the fragment is how we express reordering
 * (per DOM spec, appendChild moves already-attached nodes).
 *
 * Do NOT:
 * - Skip appending based on parentElement or existing attachment
 * - Rely on vnode identity (===) to decide DOM reuse (vnodes are mutable)
 * - Introduce fast-paths that might skip DOM reconstruction
 */
export function createForBoundary(
  node: DOMElement,
  props: Record<string, unknown>
): DocumentFragment {
  void props;
  const controlState = getControlBoundaryState(node);

  if (!controlState) {
    if (getRuntimeEnv().NODE_ENV !== 'production') {
      logger.warn('[Askr] Control boundary missing state');
    }
    return document.createDocumentFragment();
  }

  const childrenVNodes = evaluateControlBoundaryState(controlState);

  const fragment = document.createDocumentFragment();

  if (controlState.kind !== 'for') {
    const activeScope = controlState.activeScope;
    const vnode = childrenVNodes[0];
    if (activeScope && vnode !== undefined) {
      const dom = materializeChildScopeDom(vnode);
      activeScope.dom = dom ?? undefined;
      if (dom) {
        fragment.appendChild(dom);
      }
    }
    clearControlBoundaryDomUpdateState(controlState);
    return fragment;
  }

  const forState = controlState;
  if (forState.orderedKeys.length === 0) {
    const fallbackScope = forState.fallbackScope;
    const fallbackVNode = childrenVNodes[0];
    if (fallbackScope && fallbackVNode !== undefined) {
      const dom = materializeChildScopeDom(fallbackVNode);
      fallbackScope.dom = dom ?? undefined;
      if (dom) {
        fragment.appendChild(dom);
      }
    }
    clearControlBoundaryDomUpdateState(controlState);
    return fragment;
  }

  for (let i = 0; i < childrenVNodes.length; i++) {
    const childVNode = childrenVNodes[i];
    const itemKey = forState.orderedKeys[i];
    const itemInstance = itemKey != null ? forState.items.get(itemKey) : null;

    let dom: Node | null = null;

    if (itemInstance && itemInstance.scope.dom) {
      const cachedDom = itemInstance.scope.dom;
      if (!checkVNodeShapeChanged(cachedDom, childVNode)) {
        dom = cachedDom;
      }
    }

    if (!dom) {
      dom = materializeChildScopeDom(childVNode);
      if (itemInstance) {
        itemInstance.scope.dom = dom ?? undefined;
      }
    }

    if (dom) {
      fragment.appendChild(dom);
    }
  }

  clearControlBoundaryDomUpdateState(controlState);
  return fragment;
}

function syncForItemDom(
  parent: Element,
  scope: {
    dom?: Node;
    needsDomUpdate: boolean;
  },
  vnode: VNode
): Node | null {
  let dom = scope.dom ?? null;

  if (dom && !scope.needsDomUpdate) {
    return dom;
  }

  if (_isDOMElement(vnode) && typeof vnode.type === 'function') {
    const syncedComponentDom = syncComponentElement(
      dom,
      vnode as ElementWithContext,
      vnode.type as ComponentFunction,
      ((vnode as DOMElement).props ?? {}) as Record<string, unknown>
    );
    if (syncedComponentDom) {
      scope.dom = syncedComponentDom ?? undefined;
      return syncedComponentDom;
    }
  }

  if (!dom) {
    dom = materializeChildScopeDom(vnode);
    scope.dom = dom ?? undefined;
    return dom;
  }

  if (
    dom.nodeType === 3 &&
    (typeof vnode === 'string' || typeof vnode === 'number')
  ) {
    (dom as Text).data = String(vnode);
    return dom;
  }

  if (
    dom.nodeType === 8 &&
    (vnode === null || vnode === undefined || vnode === false)
  ) {
    return dom;
  }

  if (
    dom instanceof Element &&
    _isDOMElement(vnode) &&
    typeof vnode.type === 'string' &&
    tagNamesEqualIgnoreCase(dom.tagName, vnode.type)
  ) {
    updateElementFromVnode(dom, vnode, true);
    return dom;
  }

  const nextDom = materializeChildScopeDom(vnode);
  if (!nextDom) {
    if (dom.parentNode === parent) {
      dom.parentNode.removeChild(dom);
    }
    scope.dom = undefined;
    return null;
  }

  if (dom.parentNode === parent) {
    parent.replaceChild(nextDom, dom);
  }

  if (dom instanceof Element) {
    teardownNodeSubtree(dom);
  }

  scope.dom = nextDom;
  return nextDom;
}

export function commitForBoundaryChildren(
  parent: Element,
  controlState: ControlBoundaryState,
  childrenVNodes: VNode[]
): void {
  if (controlState.kind !== 'for') {
    const activeScope = controlState.activeScope;
    const activeVNode = childrenVNodes[0];
    const nextDom =
      activeScope && activeVNode !== undefined
        ? syncForItemDom(parent, activeScope, activeVNode)
        : null;

    for (let i = 0; i < controlState.lastRemovedNodes.length; i++) {
      const removedNode = controlState.lastRemovedNodes[i];
      if (removedNode instanceof Element) {
        teardownNodeSubtree(removedNode);
      }
      if (removedNode.parentNode === parent) {
        recordBenchEvent('domRemove');
        parent.removeChild(removedNode);
      }
    }

    if (nextDom) {
      if (
        parent.childNodes.length !== 1 ||
        parent.firstChild !== nextDom ||
        controlState.lastRemovedNodes.length > 0
      ) {
        parent.replaceChildren(nextDom);
      }
    } else if (parent.firstChild) {
      parent.textContent = '';
    }

    keyedElements.delete(parent);
    clearControlBoundaryDomUpdateState(controlState);
    return;
  }

  commitForStateBoundaryChildren(parent, controlState, childrenVNodes, {
    isProduction: () => getRuntimeEnv().NODE_ENV === 'production',
    syncForItemDom,
    tryPatchStableForDirtyItem,
  });
}
