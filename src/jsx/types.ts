/**
 * JSX type definitions
 *
 * These define the canonical JSX element shape used by:
 * - jsx-runtime
 * - jsx-dev-runtime
 * - Slot / cloneElement
 * - the reconciler
 */

import type { Props } from '../shared/types';

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

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    // Components must be synchronous
    type Element = JSXElement;

    interface IntrinsicElements {
      [elem: string]: Props;
    }

    interface ElementAttributesProperty {
      props: Props;
    }
  }
}

export {};
