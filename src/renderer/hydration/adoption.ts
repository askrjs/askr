import { hasMatchingStaticPropsIgnoringEvents } from '../props/attributes';
import {
  applyMatchingElementBindings,
  hasAnyElementBindingState,
} from '../props/bindings';
import { runRetainedElementUpdate } from '../ownership/retained-element';
import { _isDOMElement, type DOMElement } from '../types';
import { extractKey, parseEventProp, tagNamesEqualIgnoreCase } from '../utils';

let hydrationAdoptionDepth = 0;
const adoptedHydrationHosts = new WeakSet<Node>();

export function isHydrationAdoptionScopeActive(): boolean {
  return hydrationAdoptionDepth > 0;
}

export function markHydrationHostAdopted(host: Node): void {
  adoptedHydrationHosts.add(host);
}

export function isAdoptedHydrationHost(host: Node): boolean {
  return adoptedHydrationHosts.has(host);
}

export function canReconcileComponentHost(
  host: Node & {
    __ASKR_INSTANCE?: unknown;
    __ASKR_INSTANCES?: unknown[];
  },
  hasMatchingInstance: boolean
): boolean {
  return (
    hasMatchingInstance ||
    Boolean(host.__ASKR_INSTANCE) ||
    Boolean(host.__ASKR_INSTANCES?.length) ||
    isAdoptedHydrationHost(host) ||
    isHydrationAdoptionScopeActive()
  );
}

export function withIntrinsicHydrationAdoption<T>(work: () => T): T {
  hydrationAdoptionDepth += 1;
  try {
    return work();
  } finally {
    hydrationAdoptionDepth -= 1;
  }
}

function getDirectVNodeChildren(vnode: DOMElement): unknown[] {
  const children = vnode.props?.children ?? vnode.children;
  if (children === null || children === undefined || children === false) {
    return [];
  }
  return Array.isArray(children) ? children : [children];
}

function canAdoptMatchingIntrinsicSubtree(
  element: Element,
  vnode: DOMElement
): boolean {
  if (
    typeof vnode.type !== 'string' ||
    !tagNamesEqualIgnoreCase(element.tagName, vnode.type) ||
    hasAnyElementBindingState(element) ||
    extractKey(vnode) !== undefined
  ) {
    return false;
  }

  const props = (vnode.props || {}) as Record<string, unknown>;
  if (!hasMatchingStaticPropsIgnoringEvents(element, props, vnode.type)) {
    return false;
  }
  for (const key in props) {
    const value = props[key];
    const eventProp = parseEventProp(key);
    if (eventProp && typeof value !== 'function') return false;
    if (!eventProp && key !== 'ref' && typeof value === 'function')
      return false;
  }

  const children = getDirectVNodeChildren(vnode);
  if (element.childNodes.length !== children.length) return false;

  for (let index = 0; index < children.length; index += 1) {
    const child = children[index];
    const current = element.childNodes[index];
    if (typeof child === 'string' || typeof child === 'number') {
      if (current.nodeType !== 3 || (current as Text).data !== String(child)) {
        return false;
      }
      continue;
    }

    if (
      !_isDOMElement(child) ||
      typeof child.type !== 'string' ||
      !(current instanceof Element) ||
      extractKey(child) !== undefined ||
      !canAdoptMatchingIntrinsicSubtree(current, child)
    ) {
      return false;
    }
  }

  return true;
}

function adoptMatchingIntrinsicSubtree(
  element: Element,
  vnode: DOMElement
): void {
  const props = (vnode.props || {}) as Record<string, unknown>;
  let hasBindings = Object.prototype.hasOwnProperty.call(props, 'ref');
  for (const key in props) {
    if (parseEventProp(key)) {
      hasBindings = true;
      break;
    }
  }

  if (hasBindings) {
    runRetainedElementUpdate(
      element,
      () => undefined,
      () => applyMatchingElementBindings(element, props),
      undefined,
      true
    );
  }

  const children = getDirectVNodeChildren(vnode);
  for (let index = 0; index < children.length; index += 1) {
    const child = children[index];
    if (_isDOMElement(child)) {
      adoptMatchingIntrinsicSubtree(
        element.childNodes[index] as Element,
        child
      );
    }
  }
}

export function tryAdoptMatchingIntrinsicSubtree(
  element: Element,
  vnode: DOMElement
): boolean {
  if (!isHydrationAdoptionScopeActive()) return false;
  if (!canAdoptMatchingIntrinsicSubtree(element, vnode)) return false;
  adoptMatchingIntrinsicSubtree(element, vnode);
  return true;
}
