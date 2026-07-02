/**
 * JSX type definitions
 *
 * These define the canonical JSX element shape used by:
 * - jsx-runtime
 * - jsx-dev-runtime
 * - Slot / cloneElement
 * - the reconciler
 */

import type {
  IntrinsicFallbackProps,
  KnownIntrinsicElementProps,
  Props,
} from '../common/props';
import type { JSXElement } from '../common/jsx';

export { ELEMENT_TYPE, Fragment, STATIC_CHILDREN } from '../common/jsx';
export type {
  JSXComponent,
  JSXElement,
  JSXElementType,
} from '../common/jsx';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    // Components must be synchronous
    interface Element extends JSXElement {
      readonly __askrJsxElementBrand?: never;
    }

    interface IntrinsicElements extends KnownIntrinsicElementProps {
      [elem: string]:
        | IntrinsicFallbackProps
        | KnownIntrinsicElementProps[keyof KnownIntrinsicElementProps];
    }

    interface ElementAttributesProperty {
      props: Props;
    }

    interface ElementChildrenAttribute {
      children: unknown;
    }
  }
}
