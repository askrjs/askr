import { teardownNodeSubtree } from './cleanup';
import { getRendererDOMHost } from './dom-host';
import {
  smartUpdateElement,
  tagNamesEqualIgnoreCase,
} from './evaluate-reconcile';
import { _isDOMElement } from './types';
import {
  createEmptyRange,
  getOwnedRange,
  releaseOwnerRange,
} from './dom-range';

// Context identity is public and may itself be a component or a frozen object.
// Its private owner uses the same range registry as every other boundary.
const contextOwners = new WeakMap<object, object>();

export function hasDOMRange(context: object): boolean {
  return contextOwners.has(context);
}

export function createDOMRange(
  target: Element,
  context: object,
  node: unknown
): void {
  const previous = contextOwners.get(context);
  if (previous) releaseOwnerRange(previous);
  const owner = {};
  const { range, fragment } = createEmptyRange(target.ownerDocument, owner);
  target.appendChild(fragment!);
  contextOwners.set(context, owner);

  const dom = getRendererDOMHost().createDOMNode(node);
  if (dom) {
    target.insertBefore(dom, range.end);
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
  const owner = contextOwners.get(context);
  const range = owner ? getOwnedRange(owner) : undefined;
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
  const owner = contextOwners.get(context);
  if (owner) releaseOwnerRange(owner);
  contextOwners.delete(context);
}
