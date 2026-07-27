/**
 * Static subtree reuse checks for intrinsic DOM children.
 */

import { hasMatchingStaticProps } from './attributes';
import { isFragmentVNode } from './child-shape';
import { _isDOMElement, type DOMElement } from './types';
import { tagNamesEqualIgnoreCase } from './utils';

function upperCommonTagName(tag: string): string | null {
  switch (tag) {
    case 'div':
      return 'DIV';
    case 'span':
      return 'SPAN';
    case 'p':
      return 'P';
    case 'a':
      return 'A';
    case 'button':
      return 'BUTTON';
    case 'input':
      return 'INPUT';
    case 'ul':
      return 'UL';
    case 'ol':
      return 'OL';
    case 'li':
      return 'LI';
    default:
      return null;
  }
}

export function tagsEqualIgnoreCase(
  elementTagName: string,
  vnodeType: string
): boolean {
  const upperCommon = upperCommonTagName(vnodeType);
  if (upperCommon !== null && elementTagName === upperCommon) return true;
  return tagNamesEqualIgnoreCase(elementTagName, vnodeType);
}

type StaticChildSlot =
  | { kind: 'text'; value: string }
  | { kind: 'element'; value: DOMElement };

const STATIC_CHILD_SLOTS_CACHE = Symbol.for('__askrStaticChildSlots');
let staticChildSlotsCacheEnabled = true;

interface StaticChildSlotsCacheNode {
  [STATIC_CHILD_SLOTS_CACHE]?: StaticChildSlot[] | null;
}

export function setStaticChildSlotsCacheEnabled(enabled: boolean): void {
  staticChildSlotsCacheEnabled = enabled;
}

function collectStaticChildSlots(
  children: unknown,
  slots: StaticChildSlot[]
): boolean {
  if (isFragmentVNode(children)) {
    const fragmentChildren = children.props?.children ?? children.children;
    return collectStaticChildSlots(fragmentChildren, slots);
  }

  if (Array.isArray(children)) {
    for (const child of children) {
      if (!collectStaticChildSlots(child, slots)) {
        return false;
      }
    }
    return true;
  }

  if (children === null || children === undefined || children === false) {
    return true;
  }

  if (typeof children === 'string' || typeof children === 'number') {
    slots.push({ kind: 'text', value: String(children) });
    return true;
  }

  if (
    _isDOMElement(children) &&
    typeof (children as DOMElement).type === 'string'
  ) {
    slots.push({ kind: 'element', value: children as DOMElement });
    return true;
  }

  return false;
}

function getStaticChildSlots(vnode: DOMElement): StaticChildSlot[] | null {
  if (staticChildSlotsCacheEnabled) {
    const cacheNode = vnode as DOMElement & StaticChildSlotsCacheNode;
    const cached = cacheNode[STATIC_CHILD_SLOTS_CACHE];
    if (cached !== undefined) {
      return cached;
    }
  }

  const slots: StaticChildSlot[] = [];
  const staticSlots = collectStaticChildSlots(
    (vnode.props?.children ?? vnode.children) as unknown,
    slots
  )
    ? slots
    : null;
  if (staticChildSlotsCacheEnabled) {
    const cacheNode = vnode as DOMElement & StaticChildSlotsCacheNode;
    if (Object.isExtensible(vnode)) {
      cacheNode[STATIC_CHILD_SLOTS_CACHE] = staticSlots;
    }
  }
  return staticSlots;
}

export function canReuseStaticSubtree(el: Element, vnode: DOMElement): boolean {
  if (
    typeof vnode.type !== 'string' ||
    !tagsEqualIgnoreCase(el.tagName, vnode.type)
  ) {
    return false;
  }

  const props = (vnode.props || {}) as Record<string, unknown>;
  if (!hasMatchingStaticProps(el, props, vnode.type)) {
    return false;
  }

  const slots = getStaticChildSlots(vnode);
  if (!slots) {
    return false;
  }

  if (el.childNodes.length !== slots.length) {
    return false;
  }

  for (let index = 0; index < slots.length; index += 1) {
    const slot = slots[index];
    const current = el.childNodes[index];
    if (!current) {
      return false;
    }

    if (slot.kind === 'text') {
      if (current.nodeType !== 3 || (current as Text).data !== slot.value) {
        return false;
      }
      continue;
    }

    if (!(current instanceof Element)) {
      return false;
    }

    if (!canReuseStaticSubtree(current, slot.value)) {
      return false;
    }
  }

  return true;
}
