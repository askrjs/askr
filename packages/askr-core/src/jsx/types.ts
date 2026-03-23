/**
 * JSX type definitions
 *
 * These define the canonical JSX element shape used by:
 * - jsx-runtime
 * - jsx-dev-runtime
 * - Slot / cloneElement
 * - the reconciler
 */

import type { Props } from '../common/props';
import type { JSXElement } from '../common/jsx';

export { ELEMENT_TYPE, Fragment } from '../common/jsx';
export type { JSXElement } from '../common/jsx';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    // Components must be synchronous
    interface Element extends JSXElement {
      readonly __askrJsxElementBrand?: never;
    }

    interface IntrinsicElements {
      [elem: string]: Props;
    }

    interface ElementAttributesProperty {
      props: Props;
    }
  }
}

export {};
