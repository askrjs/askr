/**
 * JSX type definitions
 */

import type { Props } from '../shared/types';

export interface JSXElement {
  type:
    | string
    | ((props: Props) => JSXElement | null | Promise<JSXElement | null>);
  props: Props;
  key?: string | number;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    type Element = JSXElement | Promise<JSXElement | null>;
    interface IntrinsicElements {
      [elem: string]: Props;
    }
    interface ElementAttributesProperty {
      props: Props;
    }
  }
}

export {};
