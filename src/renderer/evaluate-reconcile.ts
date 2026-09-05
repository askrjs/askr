import { writeHostOwners } from './dom-ownership';
import { logger } from '../common/logger';
import { getRuntimeEnv } from './env';
import type { Props } from '../common/props';
import type { ComponentInstance } from '../runtime';
import { elementListeners, updateElementRef } from './cleanup';
import { keyedElements } from './keyed';
import { createElementForNamespace, getParentNamespace } from './namespaces';
import { reconcileKeyedChildren } from './reconcile';
import { _isDOMElement, type DOMElement, type VNode } from './types';
import { __CONTROL_BOUNDARY__ } from '../common/vnode';
import {
  commitForBoundaryChildren,
  evaluateControlBoundaryState,
  getControlBoundaryState,
} from './boundaries';
import {
  isBulkTextFastPathEligible,
  performBulkPositionalKeyedTextUpdate,
  performBulkTextReplace,
} from './children';
import { getRendererDOMHost } from './dom-host';
import {
  updateMixedControlChildren,
  updateUnkeyedChildren,
} from './element-children';
import { setDevValue, incDevCounter } from '../runtime';
import { isFragmentType } from '../common/jsx';
import {
  createWrappedHandler,
  extractKey,
  getMaterializedKey,
  getEventListenerKey,
  getEventListenerOptions,
  isSkippedProp,
  parseEventProp,
  setRenderedAttribute,
  tagNamesEqualIgnoreCase as sharedTagNamesEqualIgnoreCase,
  writeElementClassName,
} from './utils';
import { runRetainedElementUpdate } from './retained-element-rollback';
import { tryAdoptMatchingIntrinsicSubtree } from './intrinsic-hydration-adoption';
import { getLogicalChildHosts } from './dom-range';

declare const __ASKR_DEVELOPMENT_BUILD__: boolean;

const DEVELOPMENT_BUILD_ENABLED = __ASKR_DEVELOPMENT_BUILD__;

type ComponentHostElement = Element & {
  __ASKR_INSTANCE?: ComponentInstance;
  __ASKR_INSTANCES?: ComponentInstance[];
};

export function getRetainedHostOwnerChain(
  host: ComponentHostElement,
  owner: ComponentInstance
): ComponentInstance[] {
  const instances = host.__ASKR_INSTANCES ?? [];
  const ownerIndex = instances.indexOf(owner);

  return ownerIndex >= 0 ? instances.slice(ownerIndex) : [owner];
}

export function retainHostOwnerChain(
  host: Element,
  owner: ComponentInstance,
  retainedInstances: ComponentInstance[]
): void {
  const componentHost = host as ComponentHostElement;
  const existing = componentHost.__ASKR_INSTANCES ?? [];
  const nextInstances = [...existing];

  for (const instance of retainedInstances) {
    if (!nextInstances.includes(instance)) {
      nextInstances.push(instance);
    }
  }

  writeHostOwners(componentHost, nextInstances, owner);
}

interface SimpleTextResult {
  isSimple: true;
  text: string;
}

interface NotSimpleTextResult {
  isSimple: false;
  text?: undefined;
}

type TextCheckResult = SimpleTextResult | NotSimpleTextResult;

export function tagNamesEqualIgnoreCase(a: string, b: string): boolean {
  return sharedTagNamesEqualIgnoreCase(a, b);
}

function checkSimpleText(vnodeChildren: unknown): TextCheckResult {
  if (!Array.isArray(vnodeChildren)) {
    if (
      typeof vnodeChildren === 'string' ||
      typeof vnodeChildren === 'number'
    ) {
      return { isSimple: true, text: String(vnodeChildren) };
    }
  } else if (vnodeChildren.length === 1) {
    const child = vnodeChildren[0];
    if (typeof child === 'string' || typeof child === 'number') {
      return { isSimple: true, text: String(child) };
    }
  }
  return { isSimple: false };
}

function tryUpdateTextInPlace(element: Element, text: string): boolean {
  if (element.childNodes.length === 1 && element.firstChild?.nodeType === 3) {
    (element.firstChild as Text).data = text;
    return true;
  }
  return false;
}

function buildKeyMapFromDOM(parent: Element): Map<string | number, Element> {
  const keyMap = new Map<string | number, Element>();
  for (const host of getLogicalChildHosts(parent)) {
    if (!(host instanceof Element)) continue;
    const key = getMaterializedKey(host);
    if (key !== undefined) {
      keyMap.set(key, host);
    }
  }
  return keyMap;
}

function getOrBuildKeyMap(
  parent: Element
): Map<string | number, Element> | undefined {
  let keyMap = keyedElements.get(parent);
  if (!keyMap) {
    keyMap = buildKeyMapFromDOM(parent);
    if (keyMap.size > 0) {
      keyedElements.set(parent, keyMap);
    }
  }
  return keyMap.size > 0 ? keyMap : undefined;
}

function hasKeyedChildren(children: unknown[]): boolean {
  for (let i = 0; i < children.length; i++) {
    if (extractKey(children[i]) !== undefined) return true;
  }
  return false;
}

function trackBulkTextStats(
  stats: ReturnType<typeof performBulkTextReplace>
): void {
  if (getRuntimeEnv().NODE_ENV !== 'production') {
    try {
      setDevValue('__LAST_BULK_TEXT_FASTPATH_STATS', stats);
      incDevCounter('bulkTextHits');
    } catch {
      // ignore
    }
  }
}

function trackBulkTextMiss(): void {
  if (getRuntimeEnv().NODE_ENV !== 'production') {
    try {
      incDevCounter('bulkTextMisses');
    } catch {
      // ignore
    }
  }
}

function reconcileKeyed(
  parent: Element,
  children: VNode[],
  oldKeyMap: Map<string | number, Element> | undefined
): void {
  if (getRuntimeEnv().ASKR_FORCE_BULK_POSREUSE === '1') {
    const result = tryForcedBulkKeyedPath(parent, children);
    if (result) return;
  }

  const newKeyMap = reconcileKeyedChildren(parent, children, oldKeyMap);
  keyedElements.set(parent, newKeyMap);
}

function tryForcedBulkKeyedPath(parent: Element, children: VNode[]): boolean {
  try {
    const keyedVnodes: Array<{ key: string | number; vnode: VNode }> = [];
    for (const child of children) {
      const key = extractKey(child);
      if (_isDOMElement(child) && key !== undefined) {
        keyedVnodes.push({
          key,
          vnode: child,
        });
      }
    }

    if (keyedVnodes.length === 0 || keyedVnodes.length !== children.length) {
      return false;
    }

    if (DEVELOPMENT_BUILD_ENABLED) {
      const fastPathEnv = getRuntimeEnv();
      if (
        fastPathEnv.ASKR_FASTPATH_DEBUG === '1' ||
        fastPathEnv.ASKR_FASTPATH_DEBUG === 'true'
      ) {
        logger.warn(
          '[Askr][FASTPATH] forced positional bulk keyed reuse (evaluate-level)'
        );
      }
    }

    const stats = performBulkPositionalKeyedTextUpdate(parent, keyedVnodes);

    if (DEVELOPMENT_BUILD_ENABLED) {
      const statsEnv = getRuntimeEnv();
      if (
        statsEnv.NODE_ENV !== 'production' ||
        statsEnv.ASKR_FASTPATH_DEBUG === '1'
      ) {
        try {
          setDevValue('__LAST_FASTPATH_STATS', stats);
          setDevValue('__LAST_FASTPATH_COMMIT_COUNT', 1);
          incDevCounter('bulkKeyedPositionalForced');
        } catch {
          // ignore
        }
      }
    }

    const newMap = buildKeyMapFromDOM(parent);
    keyedElements.set(parent, newMap);
    return true;
  } catch (err) {
    if (DEVELOPMENT_BUILD_ENABLED) {
      const fallbackEnv = getRuntimeEnv();
      if (
        fallbackEnv.ASKR_FASTPATH_DEBUG === '1' ||
        fallbackEnv.ASKR_FASTPATH_DEBUG === 'true'
      ) {
        logger.warn(
          '[Askr][FASTPATH] forced bulk path failed, falling back',
          err
        );
      }
    }
    return false;
  }
}

function reconcileUnkeyed(parent: Element, children: VNode[]): void {
  if (isBulkTextFastPathEligible(parent, children)) {
    const stats = performBulkTextReplace(parent, children);
    trackBulkTextStats(stats);
  } else {
    trackBulkTextMiss();
    updateUnkeyedChildren(parent, children);
  }
  keyedElements.delete(parent);
}

export function updateForBoundaryChildren(
  element: Element,
  forVnode: DOMElement
): void {
  const controlState = getControlBoundaryState(forVnode);
  if (!controlState) return;

  const childrenVNodes = evaluateControlBoundaryState(controlState);
  commitForBoundaryChildren(element, controlState, childrenVNodes);
}

export function updateElementChildren(
  element: Element,
  vnodeChildren: unknown,
  cleanupRangeNode: (node: Node) => void
): void {
  const domHost = getRendererDOMHost();

  if (vnodeChildren === null || vnodeChildren === undefined) {
    for (let n = element.firstChild; n;) {
      const next = n.nextSibling;
      cleanupRangeNode(n);
      n = next;
    }
    element.textContent = '';
    keyedElements.delete(element);
    return;
  }

  if (
    !Array.isArray(vnodeChildren) &&
    _isDOMElement(vnodeChildren) &&
    (vnodeChildren as DOMElement).type === __CONTROL_BOUNDARY__
  ) {
    updateForBoundaryChildren(element, vnodeChildren as DOMElement);
    return;
  }

  if (!Array.isArray(vnodeChildren) && isFragment(vnodeChildren)) {
    updateElementChildren(
      element,
      getFragmentChildren(vnodeChildren),
      cleanupRangeNode
    );
    return;
  }

  if (!Array.isArray(vnodeChildren)) {
    for (let n = element.firstChild; n;) {
      const next = n.nextSibling;
      cleanupRangeNode(n);
      n = next;
    }
    element.textContent = '';
    const dom = domHost.createDOMNode(vnodeChildren);
    if (dom) element.appendChild(dom);
    keyedElements.delete(element);
    return;
  }

  if (
    vnodeChildren.length === 1 &&
    _isDOMElement(vnodeChildren[0]) &&
    (vnodeChildren[0] as DOMElement).type === __CONTROL_BOUNDARY__
  ) {
    updateForBoundaryChildren(element, vnodeChildren[0] as DOMElement);
    return;
  }

  if (
    vnodeChildren.some(
      (child) =>
        _isDOMElement(child) &&
        (child as DOMElement).type === __CONTROL_BOUNDARY__
    )
  ) {
    updateMixedControlChildren(element, vnodeChildren as VNode[], false);
    keyedElements.delete(element);
    return;
  }

  if (hasKeyedChildren(vnodeChildren)) {
    const oldKeyMap = getOrBuildKeyMap(element);
    reconcileKeyed(element, vnodeChildren, oldKeyMap);
  } else {
    reconcileUnkeyed(element, vnodeChildren);
  }
}

export function smartUpdateElement(
  element: Element,
  vnode: DOMElement,
  cleanupRangeNode: (node: Node) => void
): void {
  if (tryAdoptMatchingIntrinsicSubtree(element, vnode)) {
    return;
  }

  const hadVNodeKey = Object.prototype.hasOwnProperty.call(vnode, 'key');
  const previousVNodeKey = vnode.key;

  runRetainedElementUpdate(
    element,
    cleanupRangeNode,
    () => applySmartUpdateElement(element, vnode, cleanupRangeNode),
    () => {
      if (hadVNodeKey) vnode.key = previousVNodeKey;
      else delete vnode.key;
    }
  );
}

function applySmartUpdateElement(
  element: Element,
  vnode: DOMElement,
  cleanupRangeNode: (node: Node) => void
): void {
  const domHost = getRendererDOMHost();

  if (vnode.key == null && element.hasAttribute('data-key')) {
    const existingKey = getMaterializedKey(element);
    if (existingKey !== undefined) {
      vnode.key = existingKey;
    }
  }

  let vnodeChildren = vnode.props?.children ?? vnode.children;

  if (
    vnodeChildren &&
    _isDOMElement(vnodeChildren) &&
    (vnodeChildren as DOMElement).type === __CONTROL_BOUNDARY__
  ) {
    updateElementChildren(element, vnodeChildren, cleanupRangeNode);
    domHost.updateElementFromVnode(element, vnode, false);
    return;
  }

  if (vnodeChildren && !Array.isArray(vnodeChildren)) {
    vnodeChildren = [vnodeChildren];
  }

  const textCheck = checkSimpleText(vnodeChildren);

  if (textCheck.isSimple && tryUpdateTextInPlace(element, textCheck.text)) {
    // Text updated in place.
  } else {
    updateElementChildren(element, vnodeChildren, cleanupRangeNode);
  }

  domHost.updateElementFromVnode(element, vnode, false);
}

export function processFragmentChildren(
  target: Element,
  childArray: unknown[],
  cleanupRangeNode: (node: Node) => void
): void {
  updateElementChildren(target, childArray, cleanupRangeNode);
}

function applyPropsToElement(el: Element, props: Props): void {
  for (const [key, value] of Object.entries(props)) {
    if (key === 'ref') {
      updateElementRef(el, value);
      continue;
    }

    if (isSkippedProp(key)) continue;
    if (value === undefined || value === null || value === false) continue;

    const eventProp = parseEventProp(key);
    if (eventProp) {
      const { eventName, capture } = eventProp;
      const wrappedHandler = createWrappedHandler(value as EventListener, true);
      const options = getEventListenerOptions(eventName, capture);
      const listenerKey = getEventListenerKey(eventName, capture);

      if (options !== undefined)
        el.addEventListener(eventName, wrappedHandler, options);
      else el.addEventListener(eventName, wrappedHandler);

      if (!elementListeners.has(el)) elementListeners.set(el, new Map());
      elementListeners.get(el)!.set(listenerKey, {
        handler: wrappedHandler,
        original: value as EventListener,
        eventName,
        options,
      });
      continue;
    }

    if (key === 'class' || key === 'className') {
      writeElementClassName(el, String(value));
    } else if (key === 'value' || key === 'checked') {
      (el as HTMLElement & Props)[key] = value;
    } else {
      setRenderedAttribute(el, key, String(value));
    }
  }
}

export function tryFirstRenderKeyedChildren(
  target: Element,
  vnode: DOMElement
): boolean {
  const children = vnode.children;
  if (!Array.isArray(children) || !hasKeyedChildren(children)) {
    return false;
  }

  const el = createElementForNamespace(
    vnode.type as string,
    getParentNamespace(target)
  );
  target.appendChild(el);

  applyPropsToElement(el, vnode.props || {});

  const newKeyMap = reconcileKeyedChildren(el, children, undefined);
  keyedElements.set(el, newKeyMap);
  return true;
}

export function isFragment(vnode: unknown): vnode is DOMElement {
  return _isDOMElement(vnode) && isFragmentType((vnode as DOMElement).type);
}

export function isMultiNodeVNode(vnode: VNode): boolean {
  if (vnode === null || vnode === undefined || vnode === false) return true;
  return Array.isArray(vnode) || isFragment(vnode);
}

export function getFragmentChildren(vnode: DOMElement): unknown[] {
  const fragmentChildren = vnode.props?.children ?? vnode.children ?? [];
  return Array.isArray(fragmentChildren)
    ? fragmentChildren
    : [fragmentChildren];
}
