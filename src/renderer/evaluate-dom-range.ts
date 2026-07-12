import { teardownNodeSubtree } from './cleanup';
import { getRendererDOMHost } from './dom-host';
import {
  smartUpdateElement,
  tagNamesEqualIgnoreCase,
} from './evaluate-reconcile';
import { _isDOMElement } from './types';
import { RANGE_END_MARKER, RANGE_START_MARKER } from './dom-range';

interface DOMRange {
  start: Node;
  end: Node;
}

const domRanges = new WeakMap<object, DOMRange>();

export function hasDOMRange(context: object): boolean {
  return domRanges.has(context);
}

export function createDOMRange(
  target: Element,
  context: object,
  node: unknown
): void {
  const start = document.createComment(RANGE_START_MARKER);
  const end = document.createComment(RANGE_END_MARKER);
  target.appendChild(start);
  target.appendChild(end);
  domRanges.set(context, { start, end });

  const dom = getRendererDOMHost().createDOMNode(node);
  if (dom) {
    target.insertBefore(dom, end);
  }
}

export function cleanupRangeNode(node: Node): void {
  teardownNodeSubtree(node);
}

export function updateDOMRangeForContext(
  target: Element,
  context: object,
  children: unknown[]
): void {
  const range = domRanges.get(context);
  if (!range) {
    return;
  }

  let current: Node | null = range.start.nextSibling;
  const domHost = getRendererDOMHost();

  for (let i = 0; i < children.length; i++) {
    const nextChild = children[i];
    const currentNode = current === range.end ? null : current;
    const nextCurrent = currentNode?.nextSibling ?? null;

    if (nextChild === null || nextChild === undefined || nextChild === false) {
      if (currentNode) {
        cleanupRangeNode(currentNode);
        target.removeChild(currentNode);
      }
      current = nextCurrent;
      continue;
    }

    if (typeof nextChild === 'string' || typeof nextChild === 'number') {
      if (currentNode?.nodeType === 3) {
        (currentNode as Text).data = String(nextChild);
      } else {
        const textNode = document.createTextNode(String(nextChild));
        if (currentNode) {
          cleanupRangeNode(currentNode);
          target.replaceChild(textNode, currentNode);
        } else {
          target.insertBefore(textNode, range.end);
        }
      }
      current = nextCurrent;
      continue;
    }

    if (
      currentNode instanceof Element &&
      _isDOMElement(nextChild) &&
      typeof nextChild.type === 'string' &&
      tagNamesEqualIgnoreCase(currentNode.tagName, nextChild.type)
    ) {
      smartUpdateElement(currentNode, nextChild, cleanupRangeNode);
      current = nextCurrent;
      continue;
    }

    const newDom = domHost.createDOMNode(nextChild);
    if (!newDom) {
      if (currentNode) {
        cleanupRangeNode(currentNode);
        target.removeChild(currentNode);
      }
      current = nextCurrent;
      continue;
    }

    if (currentNode) {
      cleanupRangeNode(currentNode);
      target.replaceChild(newDom, currentNode);
    } else {
      target.insertBefore(newDom, range.end);
    }

    current = nextCurrent;
  }

  while (current && current !== range.end) {
    const next = current.nextSibling;
    cleanupRangeNode(current);
    target.removeChild(current);
    current = next;
  }
}

export function clearDOMRange(context: object): void {
  domRanges.delete(context);
}
