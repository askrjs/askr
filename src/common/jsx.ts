/**
 * Common call contracts: JSX element shape
 */

import type { Props } from './props';

export const ELEMENT_TYPE = Symbol.for('askr.element');
export const Fragment = Symbol.for('askr.fragment');
export const STATIC_CHILDREN = Symbol.for('askr.static-children');

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
