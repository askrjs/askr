/**
 * JSX dev runtime factory
 * Same as production runtime but with dev warnings
 */

import './types';

export interface JSXElement {
  type: unknown;
  props: Record<string, unknown>;
  key?: string | number;
}

export function jsxDEV(
  type: unknown,
  props: Record<string, unknown> | null,
  key?: string | number
): JSXElement {
  return {
    type,
    props: props || {},
    key,
  };
}

export const Fragment = Symbol('Fragment');
