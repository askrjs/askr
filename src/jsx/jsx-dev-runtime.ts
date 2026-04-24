/**
 * JSX dev runtime factory
 * Same element shape as production runtime, with room for dev warnings.
 */
import type { Props } from '../common/props';
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
  type: unknown,
  props: Record<string, unknown> | null,
  key?: string | number,
  isStaticChildren = false
): JSXElement {
  const normalizedProps = annotatePropsUsage(props);

  return {
    $$typeof: ELEMENT_TYPE,
    type: type as string | ((props: Props) => unknown) | symbol,
    props: isStaticChildren
      ? markStaticChildren(normalizedProps)
      : normalizedProps,
    key: key ?? null,
  };
}

// Re-export Fragment for JSX
export { Fragment };
