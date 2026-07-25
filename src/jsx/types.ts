/**
 * JSX type definitions
 *
 * These define the canonical JSX element shape used by:
 * - jsx-runtime
 * - jsx-dev-runtime
 * - Slot / cloneElement
 * - the reconciler
 */

import type { KnownIntrinsicElementProps, Props } from '../common/props';
import type { JSXElement } from '../common/jsx';

export { ELEMENT_TYPE, Fragment, STATIC_CHILDREN } from '../common/jsx';
export type { JSXComponent, JSXElement, JSXElementType } from '../common/jsx';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    // Components must be synchronous
    interface Element extends JSXElement {
      readonly __askrJsxElementBrand?: never;
    }

    interface IntrinsicElements {
      a: KnownIntrinsicElementProps['a'];
      article: KnownIntrinsicElementProps['article'];
      aside: KnownIntrinsicElementProps['aside'];
      blockquote: KnownIntrinsicElementProps['blockquote'];
      button: KnownIntrinsicElementProps['button'];
      caption: KnownIntrinsicElementProps['caption'];
      circle: KnownIntrinsicElementProps['circle'];
      code: KnownIntrinsicElementProps['code'];
      div: KnownIntrinsicElementProps['div'];
      em: KnownIntrinsicElementProps['em'];
      figcaption: KnownIntrinsicElementProps['figcaption'];
      figure: KnownIntrinsicElementProps['figure'];
      form: KnownIntrinsicElementProps['form'];
      footer: KnownIntrinsicElementProps['footer'];
      g: KnownIntrinsicElementProps['g'];
      h1: KnownIntrinsicElementProps['h1'];
      h2: KnownIntrinsicElementProps['h2'];
      h3: KnownIntrinsicElementProps['h3'];
      h4: KnownIntrinsicElementProps['h4'];
      h5: KnownIntrinsicElementProps['h5'];
      h6: KnownIntrinsicElementProps['h6'];
      header: KnownIntrinsicElementProps['header'];
      img: KnownIntrinsicElementProps['img'];
      input: KnownIntrinsicElementProps['input'];
      label: KnownIntrinsicElementProps['label'];
      li: KnownIntrinsicElementProps['li'];
      main: KnownIntrinsicElementProps['main'];
      nav: KnownIntrinsicElementProps['nav'];
      ol: KnownIntrinsicElementProps['ol'];
      option: KnownIntrinsicElementProps['option'];
      p: KnownIntrinsicElementProps['p'];
      path: KnownIntrinsicElementProps['path'];
      pre: KnownIntrinsicElementProps['pre'];
      select: KnownIntrinsicElementProps['select'];
      section: KnownIntrinsicElementProps['section'];
      span: KnownIntrinsicElementProps['span'];
      strong: KnownIntrinsicElementProps['strong'];
      svg: KnownIntrinsicElementProps['svg'];
      table: KnownIntrinsicElementProps['table'];
      tbody: KnownIntrinsicElementProps['tbody'];
      td: KnownIntrinsicElementProps['td'];
      textarea: KnownIntrinsicElementProps['textarea'];
      th: KnownIntrinsicElementProps['th'];
      thead: KnownIntrinsicElementProps['thead'];
      tr: KnownIntrinsicElementProps['tr'];
      ul: KnownIntrinsicElementProps['ul'];
    }

    interface ElementAttributesProperty {
      props: Props;
    }

    interface ElementChildrenAttribute {
      children: unknown;
    }
  }
}
