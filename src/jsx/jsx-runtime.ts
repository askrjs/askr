/**
 * JSX runtime factory
 * Same element shape as production runtime.
 */

import { ELEMENT_TYPE, Fragment, type JSXElement } from './types';

export function jsxDEV(
  type: unknown,
  props: Record<string, unknown> | null,
  key?: string | number
): JSXElement {
  return {
    $$typeof: ELEMENT_TYPE,
    type,
    props: props ?? {},
    key: key ?? null,
  };
}

// Production-style helpers: alias to the DEV factory for now
export function jsx(
  type: unknown,
  props: Record<string, unknown> | null,
  key?: string | number
) {
  return jsxDEV(type, props, key);
}

export function jsxs(
  type: unknown,
  props: Record<string, unknown> | null,
  key?: string | number
) {
  return jsxDEV(type, props, key);
}

// Re-export Fragment for JSX.
export { Fragment };
