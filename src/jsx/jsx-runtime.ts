/**
 * JSX runtime factory
 * Same element shape as production runtime.
 */

import type {
  IntrinsicFallbackProps,
  KnownIntrinsicElementProps,
  Props,
} from '../common/props';
import {
  isEagerControlPrimitive,
  type EagerControlPrimitive,
} from '../common/control';
import {
  ELEMENT_TYPE,
  Fragment,
  STATIC_CHILDREN,
  type JSXElementType,
  type JSXElement,
} from './types';
import { markReadableUsage } from '../runtime';

declare const __ASKR_DEVELOPMENT_BUILD__: boolean;

const DEVELOPMENT_BUILD_ENABLED = __ASKR_DEVELOPMENT_BUILD__;

// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace JSX {
  export interface Element extends JSXElement {
    readonly __askrJsxElementBrand?: never;
  }

  export interface IntrinsicElements extends KnownIntrinsicElementProps {
    [elem: string]:
      | IntrinsicFallbackProps
      | KnownIntrinsicElementProps[keyof KnownIntrinsicElementProps];
  }

  export interface ElementAttributesProperty {
    props: Props;
  }

  export interface ElementChildrenAttribute {
    children: unknown;
  }
}

function annotatePropsUsage(props: Props): void {
  for (const key in props) {
    markReadableUsage(props[key]);
  }
}

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
  props: KnownIntrinsicElementProps[TTag] | null,
  key?: string | number,
  isStaticChildren?: boolean
): JSXElement;
export function jsxDEV<TTag extends string>(
  type: Exclude<TTag, keyof KnownIntrinsicElementProps>,
  props: IntrinsicFallbackProps | null,
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
  if (DEVELOPMENT_BUILD_ENABLED) {
    annotatePropsUsage(normalizedProps);
    if (isStaticChildren) {
      markStaticChildren(normalizedProps);
    }
  }

  if (typeof type === 'function' && isEagerControlPrimitive(type)) {
    return type(normalizedProps);
  }

  return {
    $$typeof: ELEMENT_TYPE,
    type: type as JSXElementType,
    props: normalizedProps,
    key: key ?? null,
  };
}

// Production-style helpers: alias to the DEV factory for now
export function jsx(
  type: EagerControlPrimitive,
  props: Props | null,
  key?: string | number
): unknown;
export function jsx<TTag extends keyof KnownIntrinsicElementProps>(
  type: TTag,
  props: KnownIntrinsicElementProps[TTag] | null,
  key?: string | number
): JSXElement;
export function jsx<TTag extends string>(
  type: Exclude<TTag, keyof KnownIntrinsicElementProps>,
  props: IntrinsicFallbackProps | null,
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
  if (DEVELOPMENT_BUILD_ENABLED) {
    annotatePropsUsage(normalizedProps);
  }

  if (typeof type === 'function' && isEagerControlPrimitive(type)) {
    return type(normalizedProps);
  }

  return {
    $$typeof: ELEMENT_TYPE,
    type: type as JSXElementType,
    props: normalizedProps,
    key: key ?? null,
  } as JSXElement;
}

export function jsxs(
  type: EagerControlPrimitive,
  props: Props | null,
  key?: string | number
): unknown;
export function jsxs<TTag extends keyof KnownIntrinsicElementProps>(
  type: TTag,
  props: KnownIntrinsicElementProps[TTag] | null,
  key?: string | number
): JSXElement;
export function jsxs<TTag extends string>(
  type: Exclude<TTag, keyof KnownIntrinsicElementProps>,
  props: IntrinsicFallbackProps | null,
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
  if (DEVELOPMENT_BUILD_ENABLED) {
    annotatePropsUsage(normalizedProps);
    markStaticChildren(normalizedProps);
  }

  if (typeof type === 'function' && isEagerControlPrimitive(type)) {
    return type(normalizedProps);
  }

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
