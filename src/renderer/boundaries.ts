import { logger } from '../dev/logger';
import type { Props } from '../common/props';
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
  recordBenchCounter,
  recordBenchEvent,
  recordBenchTiming,
  type ForCommitStrategy,
  type ForState,
  withBenchMetricScope,
} from '../runtime/for';
import type { ComponentInstance } from '../runtime/component';
import { teardownNodeSubtree, removeAllListeners } from './cleanup';
import { keyedElements } from './keyed';
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
      vnode.type as (props: Props) => unknown,
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

function removeForBoundaryNodes(parent: Element, removedNodes: Node[]): void {
  if (
    removedNodes.length > 0 &&
    removedNodes.length === parent.childNodes.length
  ) {
    let canBulkClear = true;
    for (let i = 0; i < removedNodes.length; i++) {
      if (removedNodes[i].parentNode !== parent) {
        canBulkClear = false;
        break;
      }
    }

    if (canBulkClear) {
      for (let i = 0; i < removedNodes.length; i++) {
        recordBenchEvent('domRemove');
      }
      withBenchMetricScope('fullClear', () => {
        recordBenchCounter('bulkClearCommits');
        removeAllListeners(parent);
        parent.textContent = '';
      });
      return;
    }
  }

  for (let i = 0; i < removedNodes.length; i++) {
    const node = removedNodes[i];
    if (node.parentNode === parent) {
      recordBenchEvent('domRemove');
      parent.removeChild(node);
    }
  }
}

function syncKeyedMapFromForState(
  parent: Element,
  forState: ForState<unknown>,
  strategy: ForCommitStrategy,
  removedNodes: Node[]
): void {
  const existing = keyedElements.get(parent);
  const ensureMapEntry = (
    map: Map<string | number, Element>,
    key: string | number,
    element: Element
  ): void => {
    map.set(key, element);
    const keyString = String(key);
    map.set(keyString, element);
    const keyNumber = Number(keyString);
    if (!Number.isNaN(keyNumber)) {
      map.set(keyNumber, element);
    }
  };

  if (strategy === 'SWAP') {
    if (existing) {
      return;
    }
  }

  if (strategy === 'NO_REORDER') {
    if (existing && removedNodes.length === 0) {
      return;
    }

    if (existing) {
      for (const [mapKey, element] of existing) {
        if (element.parentNode !== parent) {
          existing.delete(mapKey);
        }
      }

      if (existing.size > 0) {
        keyedElements.set(parent, existing);
      } else {
        keyedElements.delete(parent);
      }
      return;
    }
  }

  if (strategy === 'TRUNCATE' && forState.orderedKeys.length === 0) {
    if (existing) {
      existing.clear();
    }
    keyedElements.delete(parent);
    return;
  }

  if (strategy === 'APPEND' && existing) {
    for (let i = 0; i < forState.orderedKeys.length; i++) {
      const key = forState.orderedKeys[i];
      if (key === null || existing.has(key)) continue;
      const itemInstance = forState.items.get(key);
      if (itemInstance?.scope.dom instanceof Element) {
        ensureMapEntry(existing, key, itemInstance.scope.dom);
      }
    }

    if (existing.size > 0) {
      keyedElements.set(parent, existing);
    } else {
      keyedElements.delete(parent);
    }
    return;
  }

  const nextMap = existing ?? new Map<string | number, Element>();
  nextMap.clear();

  for (let i = 0; i < forState.orderedKeys.length; i++) {
    const key = forState.orderedKeys[i];
    if (key === null) continue;
    const itemInstance = forState.items.get(key);
    if (itemInstance?.scope.dom instanceof Element) {
      ensureMapEntry(nextMap, key, itemInstance.scope.dom);
    }
  }

  if (nextMap.size > 0) {
    keyedElements.set(parent, nextMap);
  } else {
    keyedElements.delete(parent);
  }
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

  const forState = controlState;
  const domCommitStart = performance.now();

  const hydrateExistingForDom = (): void => {
    const domKeyMap = getOrBuildDomKeyMap(parent);
    if (!domKeyMap) {
      return;
    }

    for (let i = 0; i < forState.orderedKeys.length; i++) {
      const itemKey = forState.orderedKeys[i];
      const itemInstance = forState.items.get(itemKey);
      if (!itemInstance || itemInstance.scope.dom) {
        continue;
      }

      const existingDom = domKeyMap.get(itemKey);
      if (
        !existingDom ||
        checkVNodeShapeChanged(existingDom, childrenVNodes[i])
      ) {
        continue;
      }

      itemInstance.scope.dom = existingDom;
    }
  };

  if (forState.orderedKeys.length === 0) {
    removeForBoundaryNodes(parent, forState.lastRemovedNodes);

    const fallbackScope = forState.fallbackScope;
    const fallbackVNode = childrenVNodes[0];
    const nextDom =
      fallbackScope && fallbackVNode !== undefined
        ? syncForItemDom(parent, fallbackScope, fallbackVNode)
        : null;

    if (nextDom) {
      if (
        parent.childNodes.length !== 1 ||
        parent.firstChild !== nextDom ||
        forState.lastRemovedNodes.length > 0
      ) {
        parent.replaceChildren(nextDom);
      }
    } else if (parent.firstChild) {
      parent.textContent = '';
    }

    keyedElements.delete(parent);
    recordBenchTiming('domCommit', performance.now() - domCommitStart);
    clearForDomUpdateState(forState);
    return;
  }

  hydrateExistingForDom();

  const commitDirtyNoReorder = (): void => {
    const dirtyIndices = forState.pendingDirtyIndices;
    if (!dirtyIndices || dirtyIndices.length === 0) {
      return;
    }

    for (let dirtyIndex = 0; dirtyIndex < dirtyIndices.length; dirtyIndex++) {
      const i = dirtyIndices[dirtyIndex];
      const itemKey = forState.orderedKeys[i];
      const itemInstance = forState.items.get(itemKey);
      if (!itemInstance) {
        continue;
      }

      if (tryPatchStableForDirtyItem(itemInstance.scope)) {
        if (itemInstance.scope.dom instanceof Element) {
          itemInstance.scope.dom.setAttribute('data-key', String(itemKey));
        }
        continue;
      }

      const dom = syncForItemDom(parent, itemInstance.scope, childrenVNodes[i]);
      if (!dom) {
        continue;
      }

      if (dom.parentNode !== parent) {
        const anchor = parent.childNodes[i] ?? null;
        recordBenchEvent('domInsert');
        parent.insertBefore(dom, anchor);
      }
    }
  };

  const commitPositional = (): void => {
    for (let i = 0; i < forState.orderedKeys.length; i++) {
      const itemKey = forState.orderedKeys[i];
      const itemInstance = forState.items.get(itemKey);
      if (!itemInstance) {
        continue;
      }

      const dom = syncForItemDom(parent, itemInstance.scope, childrenVNodes[i]);
      if (!dom) {
        continue;
      }

      if (dom.parentNode !== parent) {
        const anchor = parent.childNodes[i] ?? null;
        recordBenchEvent('domInsert');
        parent.insertBefore(dom, anchor);
      }
    }
  };

  const commitAppend = (): void => {
    withBenchMetricScope('coldCreate', () => {
      const fragment = parent.ownerDocument.createDocumentFragment();
      let hasPendingAppend = false;

      for (let i = 0; i < forState.orderedKeys.length; i++) {
        const itemKey = forState.orderedKeys[i];
        const itemInstance = forState.items.get(itemKey);
        if (!itemInstance) {
          continue;
        }

        if (
          itemInstance.scope.dom?.parentNode === parent &&
          !itemInstance.scope.needsDomUpdate
        ) {
          continue;
        }

        const dom = syncForItemDom(
          parent,
          itemInstance.scope,
          childrenVNodes[i]
        );
        if (!dom) {
          continue;
        }

        if (dom.parentNode !== parent) {
          recordBenchEvent('domInsert');
          fragment.appendChild(dom);
          hasPendingAppend = true;
        }
      }

      if (hasPendingAppend) {
        parent.appendChild(fragment);
      }
    });
  };

  const commitSwap = (): void => {
    const swapIndices = forState.pendingSwapIndices;
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

    const firstKey = forState.orderedKeys[firstIndex];
    const secondKey = forState.orderedKeys[secondIndex];
    const firstItem = forState.items.get(firstKey);
    const secondItem = forState.items.get(secondKey);

    if (!firstItem || !secondItem) {
      commitReorder();
      return;
    }

    const firstDom = syncForItemDom(
      parent,
      firstItem.scope,
      childrenVNodes[firstIndex]
    );
    const secondDom = syncForItemDom(
      parent,
      secondItem.scope,
      childrenVNodes[secondIndex]
    );

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
      return;
    }

    const firstNextSibling = firstDom.nextSibling;
    recordBenchEvent('domMove');
    parent.insertBefore(firstDom, secondDom);
    recordBenchEvent('domMove');
    parent.insertBefore(secondDom, firstNextSibling);
  };

  const commitReorder = (): void => {
    const keys = forState.orderedKeys;
    const count = keys.length;

    if (forState.pendingMoveOnly && forState.lastRemovedNodes.length === 0) {
      const nodes = Array<Node>(count);

      for (let i = 0; i < count; i++) {
        const itemKey = keys[i];
        const itemInstance = forState.items.get(itemKey);
        const dom = itemInstance?.scope.dom;
        if (!dom) {
          return;
        }
        recordBenchEvent(dom.parentNode === parent ? 'domMove' : 'domInsert');
        nodes[i] = dom;
      }

      // Move-only reorders already have the exact final node set, so we can
      // commit it directly without a fragment round-trip.
      parent.replaceChildren(...nodes);
      return;
    }

    let hasExistingChild = false;
    for (let i = 0; i < count; i++) {
      const inst = forState.items.get(keys[i]);
      if (inst?.scope.dom?.parentNode === parent) {
        hasExistingChild = true;
        break;
      }
    }

    if (!hasExistingChild) {
      withBenchMetricScope('coldCreate', () => {
        const frag = parent.ownerDocument.createDocumentFragment();
        for (let i = 0; i < count; i++) {
          const itemKey = keys[i];
          const itemInstance = forState.items.get(itemKey);
          if (!itemInstance) continue;
          const dom = syncForItemDom(
            parent,
            itemInstance.scope,
            childrenVNodes[i]
          );
          if (dom) {
            recordBenchEvent('domInsert');
            frag.appendChild(dom);
          }
        }
        recordBenchCounter('replaceChildrenCommits');
        parent.replaceChildren(frag);
      });
      return;
    }

    if (forState.lastRemovedNodes.length === 0) {
      const frag = parent.ownerDocument.createDocumentFragment();

      for (let i = 0; i < count; i++) {
        const itemKey = keys[i];
        const itemInstance = forState.items.get(itemKey);
        if (!itemInstance) {
          continue;
        }

        const dom = syncForItemDom(
          parent,
          itemInstance.scope,
          childrenVNodes[i]
        );
        if (!dom) {
          continue;
        }

        recordBenchEvent(dom.parentNode === parent ? 'domMove' : 'domInsert');
        frag.appendChild(dom);
      }

      parent.replaceChildren(frag);
      return;
    }

    for (let i = 0; i < count; i++) {
      const itemKey = keys[i];
      const itemInstance = forState.items.get(itemKey);
      if (!itemInstance) {
        continue;
      }

      const dom = syncForItemDom(parent, itemInstance.scope, childrenVNodes[i]);
      if (!dom) {
        continue;
      }

      const anchor = parent.childNodes[i] ?? null;
      if (dom !== anchor) {
        recordBenchEvent('domMove');
        parent.insertBefore(dom, anchor);
      }
    }
  };

  switch (forState.lastCommitStrategy) {
    case 'NO_REORDER':
      commitDirtyNoReorder();
      break;
    case 'TRUNCATE':
      commitPositional();
      break;
    case 'APPEND':
      commitAppend();
      break;
    case 'SWAP':
      commitSwap();
      break;
    case 'FULL_KEYED':
    default:
      commitReorder();
      break;
  }

  removeForBoundaryNodes(parent, forState.lastRemovedNodes);
  syncKeyedMapFromForState(
    parent,
    forState,
    forState.lastCommitStrategy,
    forState.lastRemovedNodes
  );
  recordBenchTiming('domCommit', performance.now() - domCommitStart);
  clearForDomUpdateState(forState);
}
