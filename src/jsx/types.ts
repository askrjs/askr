/**
 * JSX type definitions
 */

import type { Props } from '../shared/types';

export interface JSXElement {
  type: string | ((props: Props) => JSXElement | null);
  props: Props;
  key?: string | number;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    // Components must be synchronous; do not allow Promise in JSX.Element.
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
