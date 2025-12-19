/**
 * JSX runtime factory
 * Thin layer — no scheduling, no logic
 */

import './types';

export interface JSXElement {
  type: unknown;
  props: Record<string, unknown>;
  key?: string | number;
}

export function jsx(
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

export function jsxs(
  type: unknown,
  props: Record<string, unknown> | null,
  key?: string | number
): JSXElement {
  return jsx(type, props, key);
}

// Fragment for rendering multiple elements without wrapper
// Compatible with both Askr's Symbol and React's Fragment pattern
export const Fragment = Symbol.for('React.Fragment');
