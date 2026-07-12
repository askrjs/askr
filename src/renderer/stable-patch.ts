import { isPromiseLike } from '../common/promise';
import {
  captureInlineRenderSnapshot,
  getCurrentInstance,
  renderComponentInline,
  warnUnusedStateReads,
  type ComponentFunction,
} from '../runtime';
import {
  getCurrentContextFrame,
  getVNodeContextFrame,
  withContext,
} from '../runtime';
import { incDevCounter } from '../runtime';
import { recordBenchEvent } from '../runtime';
import {
  findHostInstanceByType,
  inheritComponentCleanupStrict,
  inheritComponentKey,
  isRouteRootComponentVNode,
  resolveNestedComponentResult,
} from './component-host';
import { getRendererDOMHost, type InstanceHostElement } from './dom-host';
import { _isDOMElement, type DOMElement, type VNode } from './types';
import { tagNamesEqualIgnoreCase } from './utils';

function normalizeStableIntrinsicChildren(
  children: VNode | VNode[] | undefined
): VNode[] {
  if (children === null || children === undefined || children === false) {
    return [];
  }

  return Array.isArray(children) ? children : [children];
}

function getStableIntrinsicChildren(vnode: DOMElement): VNode[] {
  return normalizeStableIntrinsicChildren(
    (vnode.props?.children as VNode | VNode[] | undefined) ?? vnode.children
  );
}

function patchStableIntrinsicText(domNode: Node, nextVNode: VNode): boolean {
  if (
    domNode.nodeType !== 3 ||
    (typeof nextVNode !== 'string' && typeof nextVNode !== 'number')
  ) {
    return false;
  }

  const nextText = String(nextVNode);
  const textNode = domNode as Text;
  if (textNode.data !== nextText) {
    recordBenchEvent('domTextSet');
    textNode.data = nextText;
  }

  return true;
}

function patchStableIntrinsicElement(
  dom: Element,
  nextVNode: DOMElement
): boolean {
  if (
    typeof nextVNode.type !== 'string' ||
    !tagNamesEqualIgnoreCase(dom.tagName, nextVNode.type)
  ) {
    return false;
  }

  getRendererDOMHost().updateElementFromVnode(dom, nextVNode, false);

  const nextChildren = getStableIntrinsicChildren(nextVNode);
  if (dom.childNodes.length !== nextChildren.length) {
    return false;
  }

  for (let index = 0; index < nextChildren.length; index += 1) {
    const nextChild = nextChildren[index];

    const currentChildNode = dom.childNodes[index];
    if (!currentChildNode) {
      return false;
    }

    if (patchStableIntrinsicText(currentChildNode, nextChild)) {
      continue;
    }

    if (
      currentChildNode instanceof Element &&
      _isDOMElement(nextChild) &&
      typeof nextChild.type === 'string' &&
      patchStableIntrinsicElement(currentChildNode, nextChild)
    ) {
      continue;
    }

    return false;
  }

  return true;
}

function resolveStableIntrinsicPatchVNode(
  dom: Element,
  vnode: VNode
): DOMElement | null {
  if (!_isDOMElement(vnode)) {
    return null;
  }

  if (typeof vnode.type === 'string') {
    return tagNamesEqualIgnoreCase(dom.tagName, vnode.type) ? vnode : null;
  }

  if (typeof vnode.type !== 'function') {
    return null;
  }

  const host = dom as InstanceHostElement;
  const existingInstance = findHostInstanceByType(
    host,
    vnode.type as ComponentFunction,
    vnode,
    getCurrentInstance()
  );
  if (
    !existingInstance ||
    existingInstance.fn !== vnode.type ||
    host.__ASKR_WRAPPER_HOST
  ) {
    return null;
  }

  const snapshot =
    getVNodeContextFrame(vnode) ||
    getCurrentContextFrame() ||
    existingInstance.ownerFrame ||
    null;

  captureInlineRenderSnapshot(existingInstance);

  existingInstance.props =
    (((vnode as DOMElement).props ?? {}) as Record<string, unknown>) || {};
  existingInstance.isRoot = isRouteRootComponentVNode(vnode);
  existingInstance.portalScope =
    getCurrentInstance()?.portalScope ?? existingInstance.portalScope;
  inheritComponentCleanupStrict(existingInstance);

  if (snapshot) {
    existingInstance.ownerFrame = snapshot;
  }

  const result = withContext(snapshot, () =>
    renderComponentInline(existingInstance)
  );
  if (isPromiseLike(result)) {
    throw new Error(
      'Async components are not supported. Components must return synchronously.'
    );
  }

  const resolvedResult = resolveNestedComponentResult(
    result,
    snapshot ?? null,
    existingInstance
  );
  if (
    _isDOMElement(resolvedResult) &&
    typeof resolvedResult.type === 'string' &&
    tagNamesEqualIgnoreCase(dom.tagName, resolvedResult.type)
  ) {
    return inheritComponentKey(resolvedResult, vnode as DOMElement);
  }

  return null;
}

export function tryPatchStableForDirtyItem(scope: {
  dom?: Node;
  vnode?: VNode;
}): boolean {
  incDevCounter('stableForPatchAttempt');
  if (!(scope.dom instanceof Element) || scope.vnode === undefined) {
    return false;
  }

  const nextIntrinsic = resolveStableIntrinsicPatchVNode(
    scope.dom,
    scope.vnode
  );
  if (!nextIntrinsic) {
    return false;
  }

  const didPatch = patchStableIntrinsicElement(scope.dom, nextIntrinsic);

  const existingInstance = (scope.dom as InstanceHostElement).__ASKR_INSTANCE;
  if (didPatch && existingInstance) {
    warnUnusedStateReads(existingInstance);
  }

  if (didPatch) {
    incDevCounter('stableForPatchHit');
  }

  return didPatch;
}
