import {
  IntrinsicFallbackProps,
  KnownIntrinsicElementProps,
  JSXElement,
  Props,
} from './elements.js';
import { EagerControlPrimitive } from './eager-control.js';
declare namespace JSX {
  type ElementType = string | symbol | ((props: never) => unknown);
  interface Element extends JSXElement {
    readonly __askrJsxElementBrand?: never;
  }
  interface KnownIntrinsicElements extends KnownIntrinsicElementProps {}
  interface IntrinsicElements extends KnownIntrinsicElements {
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
declare function jsxDEV(
  type: EagerControlPrimitive,
  props: Props | null,
  key?: string | number,
  isStaticChildren?: boolean
): unknown;
declare function jsxDEV<TTag extends keyof KnownIntrinsicElementProps>(
  type: TTag,
  props: KnownIntrinsicElementProps[TTag] | null,
  key?: string | number,
  isStaticChildren?: boolean
): JSXElement;
declare function jsxDEV<TTag extends string>(
  type: Exclude<TTag, keyof KnownIntrinsicElementProps>,
  props: IntrinsicFallbackProps | null,
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
declare function jsx(
  type: EagerControlPrimitive,
  props: Props | null,
  key?: string | number
): unknown;
declare function jsx<TTag extends keyof KnownIntrinsicElementProps>(
  type: TTag,
  props: KnownIntrinsicElementProps[TTag] | null,
  key?: string | number
): JSXElement;
declare function jsx<TTag extends string>(
  type: Exclude<TTag, keyof KnownIntrinsicElementProps>,
  props: IntrinsicFallbackProps | null,
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
declare function jsxs(
  type: EagerControlPrimitive,
  props: Props | null,
  key?: string | number
): unknown;
declare function jsxs<TTag extends keyof KnownIntrinsicElementProps>(
  type: TTag,
  props: KnownIntrinsicElementProps[TTag] | null,
  key?: string | number
): JSXElement;
declare function jsxs<TTag extends string>(
  type: Exclude<TTag, keyof KnownIntrinsicElementProps>,
  props: IntrinsicFallbackProps | null,
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
