import { tagNamesEqualIgnoreCase } from '../utils';

export const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

export function getParentNamespace(parent: Element): string | undefined {
  return parent.namespaceURI === SVG_NAMESPACE ? SVG_NAMESPACE : undefined;
}

export function resolveChildNamespace(
  type: string,
  parentNamespace?: string
): string | undefined {
  if (type === 'svg') return SVG_NAMESPACE;
  if (parentNamespace === SVG_NAMESPACE && type !== 'foreignObject') {
    return SVG_NAMESPACE;
  }
  return undefined;
}

export function createElementForNamespace(
  type: string,
  parentNamespace?: string,
  ownerDocument: Document = document
): Element {
  const namespace = resolveChildNamespace(type, parentNamespace);
  return namespace
    ? ownerDocument.createElementNS(namespace, type)
    : ownerDocument.createElement(type);
}

export function canReuseIntrinsicElementInNamespace(
  existing: Element,
  type: string,
  parentNamespace: string | undefined
): boolean {
  if (!tagNamesEqualIgnoreCase(existing.tagName, type)) {
    return false;
  }

  const expectedNamespace = resolveChildNamespace(type, parentNamespace);
  return expectedNamespace === undefined
    ? true
    : existing.namespaceURI === expectedNamespace;
}
