import { ELEMENT_TYPE, JSXElement } from './types';

/** Check whether `value` is a JSX element vnode. */
export function isElement(value: unknown): value is JSXElement {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as JSXElement).$$typeof === ELEMENT_TYPE
  );
}

/** Clone a JSX element, shallow-merging `props` over its existing props. */
export function cloneElement(
  element: JSXElement,
  props: Record<string, unknown>
): JSXElement {
  return {
    $$typeof: element.$$typeof,
    type: element.type,
    key: element.key,
    props: { ...element.props, ...props },
  };
}
