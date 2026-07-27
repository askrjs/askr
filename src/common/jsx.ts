/**
 * Common call contracts: JSX element shape
 */

import type { Props } from './props';

export const ELEMENT_TYPE = Symbol.for('askr.element');
export const Fragment = Symbol.for('askr.fragment');
export const STATIC_CHILDREN = Symbol.for('askr.static-children');

export function isFragmentType(type: unknown): type is symbol {
  if (typeof type !== 'symbol') return false;
  if (type === Fragment) return true;
  const label = String(type);
  return label === 'Symbol(askr.fragment)' || label === 'Symbol(Fragment)';
}

export type JSXComponent<TProps extends object = Props> = {
  bivarianceHack(props: TProps): unknown;
}['bivarianceHack'];

export type JSXElementType = string | JSXComponent | symbol;

export interface JSXElement {
  /** Internal element marker */
  $$typeof: symbol;

  /** Element type: string, component, Fragment, etc */
  type: JSXElementType;

  /** Props bag */
  props: Props;

  /** Optional key (normalized by runtime) */
  key?: string | number | null;
}
