/**
 * Common call contracts: JSX element shape
 */

import type { Props } from './props';

/** Internal marker identifying an object as a JSX element vnode. */
export const ELEMENT_TYPE = Symbol.for('askr.element');
/** The element type marker for JSX fragments (`<>...</>`), groups children without a wrapper element. */
export const Fragment = Symbol.for('askr.fragment');
export const STATIC_CHILDREN = Symbol.for('askr.static-children');

export function isFragmentType(type: unknown): type is symbol {
  if (typeof type !== 'symbol') return false;
  if (type === Fragment) return true;
  const label = String(type);
  return label === 'Symbol(askr.fragment)' || label === 'Symbol(Fragment)';
}

/** A component function accepting `TProps`, usable as a JSX element's `type`. */
export type JSXComponent<TProps extends object = Props> = {
  bivarianceHack(props: TProps): unknown;
}['bivarianceHack'];

/** Valid `type` values for a JSX element: a tag name, a component, or a symbol (e.g. `Fragment`). */
export type JSXElementType = string | JSXComponent | symbol;

/** The vnode shape produced by JSX/`jsx()` calls. */
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
