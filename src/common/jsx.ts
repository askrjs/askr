/**
 * Common call contracts: JSX element shape
 */

import type { Props } from './props';

export const ELEMENT_TYPE = Symbol.for('askr.element');
export const Fragment = Symbol.for('askr.fragment');
export const STATIC_CHILDREN = Symbol.for('askr.static-children');

export interface JSXElement {
  /** Internal element marker */
  $$typeof: symbol;

  /** Element type: string, component, Fragment, etc */
  type: string | ((props: Props) => unknown) | symbol;

  /** Props bag */
  props: Props;

  /** Optional key (normalized by runtime) */
  key?: string | number | null;
}
