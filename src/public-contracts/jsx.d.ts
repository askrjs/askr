import {
  IntrinsicFallbackProps,
  IntrinsicElementForTag,
  IntrinsicRef,
  KnownIntrinsicElementProps,
  MathMLExtraTag,
  JSXElement,
  Props,
} from './elements.js';
declare namespace JSX {
  type ElementType = string | symbol | ((props: never) => unknown);
  interface Element extends JSXElement {
    readonly __askrJsxElementBrand?: never;
  }
  interface KnownIntrinsicElements extends KnownIntrinsicElementProps {}
  interface IntrinsicElements
    extends KnownIntrinsicElements, OtherIntrinsicElements {
    [elem: `${string}-${string}`]: IntrinsicFallbackProps;
  }
  type OtherIntrinsicElements = {
    [
      Tag in Exclude<
        | keyof HTMLElementTagNameMap
        | keyof SVGElementTagNameMap
        | Exclude<keyof MathMLElementTagNameMap, `${string}-${string}`>
        | MathMLExtraTag,
        keyof KnownIntrinsicElementProps
      >
    ]: OtherIntrinsicProps<Tag>;
  };
  interface ElementChildrenAttribute {
    children: unknown;
  }

  /** Attributes every element accepts, including function components. */
  interface IntrinsicAttributes {
    key?: string | number;
  }
}
type OtherIntrinsicProps<Tag extends string> = Omit<
  IntrinsicFallbackProps,
  'ref'
> & { ref?: IntrinsicRef<IntrinsicElementForTag<Tag>> };

type OtherIntrinsicTag =
  | Exclude<
      | keyof HTMLElementTagNameMap
      | keyof SVGElementTagNameMap
      | Exclude<keyof MathMLElementTagNameMap, `${string}-${string}`>
      | MathMLExtraTag,
      keyof KnownIntrinsicElementProps
    >
  | `${string}-${string}`;

declare function jsxDEV<TTag extends keyof KnownIntrinsicElementProps>(
  type: TTag,
  props: KnownIntrinsicElementProps[NoInfer<TTag>] | null,
  key?: string | number,
  isStaticChildren?: boolean
): JSXElement;
declare function jsxDEV<TTag extends OtherIntrinsicTag>(
  type: TTag,
  props: OtherIntrinsicProps<TTag> | null,
  key?: string | number,
  isStaticChildren?: boolean
): JSXElement;
declare function jsxDEV<TProps extends object>(
  type: (props: TProps) => unknown,
  props: TProps | null,
  key?: string | number,
  isStaticChildren?: boolean
): JSXElement;
declare function jsxDEV(
  type: symbol,
  props: Props | null,
  key?: string | number,
  isStaticChildren?: boolean
): JSXElement;
/** JSX factory for elements with a single or no child, used by the `jsxImportSource` transform. */
declare function jsx<TTag extends keyof KnownIntrinsicElementProps>(
  type: TTag,
  props: KnownIntrinsicElementProps[NoInfer<TTag>] | null,
  key?: string | number
): JSXElement;
declare function jsx<TTag extends OtherIntrinsicTag>(
  type: TTag,
  props: OtherIntrinsicProps<TTag> | null,
  key?: string | number
): JSXElement;
declare function jsx<TProps extends object>(
  type: (props: TProps) => unknown,
  props: TProps | null,
  key?: string | number
): JSXElement;
declare function jsx(
  type: symbol,
  props: Props | null,
  key?: string | number
): JSXElement;
/** JSX factory for elements with multiple static children, used by the `jsxImportSource` transform. */
declare function jsxs<TTag extends keyof KnownIntrinsicElementProps>(
  type: TTag,
  props: KnownIntrinsicElementProps[NoInfer<TTag>] | null,
  key?: string | number
): JSXElement;
declare function jsxs<TTag extends OtherIntrinsicTag>(
  type: TTag,
  props: OtherIntrinsicProps<TTag> | null,
  key?: string | number
): JSXElement;
declare function jsxs<TProps extends object>(
  type: (props: TProps) => unknown,
  props: TProps | null,
  key?: string | number
): JSXElement;
declare function jsxs(
  type: symbol,
  props: Props | null,
  key?: string | number
): JSXElement;
export { jsxs, jsx, jsxDEV, JSX };
