/**
 * Low-level attribute access for rendered elements: the attribute name a prop
 * renders as, namespaced writes, and class names on HTML and SVG elements.
 */

import {
  attributeNamespace,
  getPublicAttributeName,
  isCustomElementName,
} from '../../common/attr-names';

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

export function isSVGDomElement(el: Element): el is SVGElement {
  return typeof SVGElement !== 'undefined' && el instanceof SVGElement;
}

export function getRenderedAttributeName(
  el: Element,
  propName: string
): string {
  const attributeName = getPublicAttributeName(
    propName,
    isCustomElementName(el.localName)
  );

  return el.namespaceURI === SVG_NAMESPACE
    ? attributeName
    : attributeName.toLowerCase();
}

/**
 * Write an attribute, placing `xlink:`/`xml:`/`xmlns:` names on SVG and MathML
 * elements in their namespace.
 */
export function writeAttribute(
  el: Element,
  attributeName: string,
  value: string,
  namespace = attributeNamespace(el.namespaceURI, attributeName)
): void {
  if (namespace === null) {
    el.setAttribute(attributeName, value);
  } else {
    el.setAttributeNS(namespace, attributeName, value);
  }
}

export function setRenderedAttribute(
  el: Element,
  propName: string,
  value: string
): void {
  writeAttribute(el, getRenderedAttributeName(el, propName), value);
}

export function removeRenderedAttribute(el: Element, propName: string): void {
  el.removeAttribute(getRenderedAttributeName(el, propName));
}

export function readElementClassName(el: Element): string {
  if (isSVGDomElement(el)) {
    return el.getAttribute('class') ?? '';
  }

  return (el as HTMLElement).className;
}

export function writeElementClassName(el: Element, value: string): void {
  if (isSVGDomElement(el)) {
    if (value.length > 0) {
      el.setAttribute('class', value);
    } else {
      el.removeAttribute('class');
    }
    return;
  }

  (el as HTMLElement).className = value;
}

export function tagNamesEqualIgnoreCase(a: string, b: string): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;

  for (let index = 0; index < a.length; index += 1) {
    const aCode = a.charCodeAt(index);
    const bCode = b.charCodeAt(index);
    if (aCode === bCode) continue;

    const normalizedA = aCode >= 65 && aCode <= 90 ? aCode + 32 : aCode;
    const normalizedB = bCode >= 65 && bCode <= 90 ? bCode + 32 : bCode;
    if (normalizedA !== normalizedB) return false;
  }

  return true;
}
