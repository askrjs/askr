/**
 * JSX dev runtime
 * Same shape as production runtime, with room for dev warnings.
 */

import './types';

export const ELEMENT_TYPE = Symbol.for('askr.element');
export const Fragment = Symbol.for('askr.fragment');

export interface JSXElement {
  $$typeof: symbol;
  type: unknown;
  props: Record<string, unknown>;
  key: string | number | null;
}

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

// `Fragment` is already exported above.
