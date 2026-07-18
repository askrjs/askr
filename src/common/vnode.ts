/**
 * Common call contracts: VNode / virtual DOM shapes
 */

import type { Props } from './props';
import type { JSXElement, JSXElementType } from './jsx';
import type { ControlBoundaryState } from '../runtime';
export { __CONTROL_BOUNDARY__ } from './control';

export const __ERROR_BOUNDARY__ = Symbol.for('askr.error-boundary');

export interface DOMElement {
  // Element `type` can be an intrinsic tag name, a component function, or
  // a special symbol (e.g. `Fragment`). Include `symbol` in the type union
  // so runtime comparisons against `Fragment` are type-safe.
  type: JSXElementType;
  props?: Props;
  children?: VNode[];
  key?: string | number | null;
  [Symbol.iterator]?: never;
  _controlState?: ControlBoundaryState; // Internal: control boundary state
}

// Type for virtual DOM nodes
export type VNode = DOMElement | string | number | boolean | null | undefined;
export type RenderableChild = VNode | JSXElement | readonly RenderableChild[];

export function _isDOMElement(node: unknown): node is DOMElement {
  return typeof node === 'object' && node !== null && 'type' in node;
}
