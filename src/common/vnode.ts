/**
 * Common call contracts: VNode / virtual DOM shapes
 */

import type { Props } from './props';
import type { ControlBoundaryState } from '../runtime/control';
import type { ForState } from '../runtime/for';
export { __CONTROL_BOUNDARY__ } from './control';
import { __CONTROL_BOUNDARY__ } from './control';

export const __ERROR_BOUNDARY__ = Symbol.for('askr.error-boundary');

export interface DOMElement {
  // Element `type` can be an intrinsic tag name, a component function, or
  // a special symbol (e.g. `Fragment`). Include `symbol` in the type union
  // so runtime comparisons against `Fragment` are type-safe.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  type: string | ((props: Props) => any) | symbol;
  props?: Props;
  children?: VNode[];
  key?: string | number | null;
  [Symbol.iterator]?: never;
  _controlState?: ControlBoundaryState; // Internal: control boundary state
  _forState?: ForState<unknown>; // Deprecated internal alias during migration
}

// Type for virtual DOM nodes
export type VNode = DOMElement | string | number | boolean | null | undefined;

// Backward-compatible internal alias while renderer/runtime migrates away from
// the old For-only boundary naming.
export const __FOR_BOUNDARY__ = __CONTROL_BOUNDARY__;

export function _isDOMElement(node: unknown): node is DOMElement {
  return typeof node === 'object' && node !== null && 'type' in node;
}
