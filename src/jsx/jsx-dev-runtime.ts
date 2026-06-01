/**
 * JSX dev runtime factory
 * Same element shape as production runtime, with room for dev warnings.
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
  type JSXElement,
} from './types';
import { markReadableUsage } from '../runtime/readable';

function annotatePropsUsage(props: Record<string, unknown> | null): Props {
  const normalizedProps = (props ?? {}) as Props;

  for (const value of Object.values(normalizedProps)) {
    markReadableUsage(value);
  }

  return normalizedProps;
}

function markStaticChildren(props: Props): Props {
  if (Array.isArray(props.children)) {
    Object.defineProperty(props.children, STATIC_CHILDREN, {
      value: true,
      configurable: true,
    });
  }

  return props;
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
  const normalizedProps = annotatePropsUsage(props);
  const preparedProps = isStaticChildren
    ? markStaticChildren(normalizedProps)
    : normalizedProps;

  if (isEagerControlPrimitive(type)) {
    return type(preparedProps);
  }

  return {
    $$typeof: ELEMENT_TYPE,
    type: type as string | ((props: Props) => unknown) | symbol,
    props: preparedProps,
    key: key ?? null,
  };
}

// Re-export Fragment for JSX
export { Fragment };
export type { JSXElement };
