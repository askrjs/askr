/**
 * Common call contracts: JSX element shape
 */

import type { Props } from './props';

export const ELEMENT_TYPE = Symbol.for('askr.element');
export const Fragment = Symbol.for('askr.fragment');

export interface JSXElement {
  /** Internal element marker (optional for plain vnode objects) */
  $$typeof?: symbol;

  /** Element type: string, component, Fragment, etc */
  type: unknown;

  /** Props bag */
  props: Props;

  /** Optional key (normalized by runtime) */
  key?: string | number | null;
}
