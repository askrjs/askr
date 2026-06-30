import { tagNamesEqualIgnoreCase } from './utils';

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

export function getParentNamespace(parent: Element): string | undefined {
  return parent.namespaceURI === SVG_NAMESPACE ? SVG_NAMESPACE : undefined;
}

export function resolveChildNamespace(
  type: string,
  parentNamespace: string | undefined
): string | undefined {
  if (type === 'svg') return SVG_NAMESPACE;
  if (parentNamespace === SVG_NAMESPACE && type !== 'foreignObject') {
    return SVG_NAMESPACE;
  }
  return undefined;
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
