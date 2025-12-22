import { ELEMENT_TYPE, JSXElement } from './types';

export function isElement(value: unknown): value is JSXElement {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as JSXElement).$$typeof === ELEMENT_TYPE
  );
}

export function cloneElement(
  element: JSXElement,
  props: Record<string, unknown>
): JSXElement {
  return {
    ...element,
    props: { ...element.props, ...props },
  };
}
