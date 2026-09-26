/**
 * JSX runtime factory
 * Same element shape as production runtime.
 */

import type {
  IntrinsicFallbackProps,
  IntrinsicElementForTag,
  IntrinsicRef,
  KnownIntrinsicElementProps,
  Props,
} from '../common/props';
import type { EagerControlPrimitive } from '../common/control';
import {
  ELEMENT_TYPE,
  Fragment,
  STATIC_CHILDREN,
  type JSXElementType,
  type JSXElement,
} from './types';

// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace JSX {
  export type ElementType = string | symbol | ((props: never) => unknown);

  export interface Element extends JSXElement {
    readonly __askrJsxElementBrand?: never;
  }

  export interface KnownIntrinsicElements extends KnownIntrinsicElementProps {}

  export interface IntrinsicElements
    extends KnownIntrinsicElements, OtherIntrinsicElements {
    [elem: `${string}-${string}`]: IntrinsicFallbackProps;
  }

  type OtherIntrinsicElements = {
    [
      Tag in Exclude<
        keyof HTMLElementTagNameMap | keyof SVGElementTagNameMap,
        keyof KnownIntrinsicElementProps
      >
    ]: OtherIntrinsicProps<Tag>;
  };

  export interface ElementChildrenAttribute {
    children: unknown;
  }
}

type OtherIntrinsicProps<Tag extends string> = Omit<
  IntrinsicFallbackProps,
  'ref'
> & { ref?: IntrinsicRef<IntrinsicElementForTag<Tag>> };

type OtherIntrinsicTag =
  | Exclude<
      keyof HTMLElementTagNameMap | keyof SVGElementTagNameMap,
      keyof KnownIntrinsicElementProps
    >
  | `${string}-${string}`;

function markStaticChildren(props: Props): void {
  if (Array.isArray(props.children)) {
    Object.defineProperty(props.children, STATIC_CHILDREN, {
      value: true,
      configurable: true,
    });
  }
}

export function jsxDEV(
  type: EagerControlPrimitive,
  props: Props | null,
  key?: string | number,
  isStaticChildren?: boolean
): unknown;
export function jsxDEV<TTag extends keyof KnownIntrinsicElementProps>(
  type: TTag,
  props: KnownIntrinsicElementProps[NoInfer<TTag>] | null,
  key?: string | number,
  isStaticChildren?: boolean
): JSXElement;
export function jsxDEV<TTag extends OtherIntrinsicTag>(
  type: TTag,
  props: OtherIntrinsicProps<TTag> | null,
  key?: string | number,
  isStaticChildren?: boolean
): JSXElement;
export function jsxDEV<TProps extends object>(
  type: (props: TProps) => unknown,
  props: TProps | null,
  key?: string | number,
  isStaticChildren?: boolean
): JSXElement;
export function jsxDEV(
  type: symbol,
  props: Props | null,
  key?: string | number,
  isStaticChildren?: boolean
): JSXElement;
export function jsxDEV(
  type: unknown,
  props: Record<string, unknown> | null,
  key?: string | number,
  isStaticChildren = false
): JSXElement | unknown {
  const normalizedProps = (props ?? {}) as Props;
  if (isStaticChildren) {
    markStaticChildren(normalizedProps);
  }

  return {
    $$typeof: ELEMENT_TYPE,
    type: type as JSXElementType,
    props: normalizedProps,
    key: key ?? null,
  };
}

// Production factories. These are separate copies of the `jsxDEV` body, not
// aliases: `jsx` never marks static children and `jsxs` always does. Keep the
// element shape in sync with `jsxDEV`.
/** JSX factory for elements with a single or no child, used by the `jsxImportSource` transform. */
export function jsx(
  type: EagerControlPrimitive,
  props: Props | null,
  key?: string | number
): unknown;
export function jsx<TTag extends keyof KnownIntrinsicElementProps>(
  type: TTag,
  props: KnownIntrinsicElementProps[NoInfer<TTag>] | null,
  key?: string | number
): JSXElement;
export function jsx<TTag extends OtherIntrinsicTag>(
  type: TTag,
  props: OtherIntrinsicProps<TTag> | null,
  key?: string | number
): JSXElement;
export function jsx<TProps extends object>(
  type: (props: TProps) => unknown,
  props: TProps | null,
  key?: string | number
): JSXElement;
export function jsx(
  type: symbol,
  props: Props | null,
  key?: string | number
): JSXElement;
export function jsx(
  type: unknown,
  props: Record<string, unknown> | null,
  key?: string | number
) {
  const normalizedProps = (props ?? {}) as Props;

  return {
    $$typeof: ELEMENT_TYPE,
    type: type as JSXElementType,
    props: normalizedProps,
    key: key ?? null,
  } as JSXElement;
}

/** JSX factory for elements with multiple static children, used by the `jsxImportSource` transform. */
export function jsxs(
  type: EagerControlPrimitive,
  props: Props | null,
  key?: string | number
): unknown;
export function jsxs<TTag extends keyof KnownIntrinsicElementProps>(
  type: TTag,
  props: KnownIntrinsicElementProps[NoInfer<TTag>] | null,
  key?: string | number
): JSXElement;
export function jsxs<TTag extends OtherIntrinsicTag>(
  type: TTag,
  props: OtherIntrinsicProps<TTag> | null,
  key?: string | number
): JSXElement;
export function jsxs<TProps extends object>(
  type: (props: TProps) => unknown,
  props: TProps | null,
  key?: string | number
): JSXElement;
export function jsxs(
  type: symbol,
  props: Props | null,
  key?: string | number
): JSXElement;
export function jsxs(
  type: unknown,
  props: Record<string, unknown> | null,
  key?: string | number
) {
  const normalizedProps = (props ?? {}) as Props;
  markStaticChildren(normalizedProps);

  return {
    $$typeof: ELEMENT_TYPE,
    type: type as JSXElementType,
    props: normalizedProps,
    key: key ?? null,
  } as JSXElement;
}

// Re-export Fragment for JSX.
export { Fragment };
export type { JSXComponent, JSXElement, JSXElementType } from './types';
