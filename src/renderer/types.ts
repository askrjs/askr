import type { Props } from '../shared/types';

export interface DOMElement {
  type: string | ((props: Props) => unknown);
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
