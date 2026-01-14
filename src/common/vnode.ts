/**
 * Common call contracts: VNode / virtual DOM shapes
 */

import type { Props } from './props';
import type { ForState } from '../runtime/for';

export interface DOMElement {
  // Element `type` can be an intrinsic tag name, a component function, or
  // a special symbol (e.g. `Fragment`). Include `symbol` in the type union
  // so runtime comparisons against `Fragment` are type-safe.
  type: string | ((props: Props) => unknown) | symbol;
  props?: Props;
  children?: VNode[];
  key?: string | number | null;
  [Symbol.iterator]?: never;
  _forState?: ForState<unknown>; // Internal: For boundary state
}

// Special symbol for For boundaries
export const __FOR_BOUNDARY__ = Symbol('__FOR_BOUNDARY__');

// Type for virtual DOM nodes
export type VNode = DOMElement | string | number | boolean | null | undefined;

export function _isDOMElement(node: unknown): node is DOMElement {
  return typeof node === 'object' && node !== null && 'type' in node;
}
