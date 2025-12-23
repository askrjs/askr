import type { Props } from '../shared/types';

export interface DOMElement {
  // Element `type` can be an intrinsic tag name, a component function, or
  // a special symbol (e.g. `Fragment`). Include `symbol` in the type union
  // so runtime comparisons against `Fragment` are type-safe.
  type: string | ((props: Props) => unknown) | symbol;
  props?: Props;
  children?: VNode[];
  key?: string | number;
  [Symbol.iterator]?: never;
}

// Type for virtual DOM nodes
export type VNode = DOMElement | string | number | boolean | null | undefined;

export function _isDOMElement(node: unknown): node is DOMElement {
  return typeof node === 'object' && node !== null && 'type' in node;
}
