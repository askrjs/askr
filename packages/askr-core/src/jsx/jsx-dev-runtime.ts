/**
 * JSX dev runtime factory
 * Same element shape as production runtime, with room for dev warnings.
 */
import type { Props } from '../common/props';
import { ELEMENT_TYPE, Fragment, type JSXElement } from './types';

export function jsxDEV(
  type: unknown,
  props: Record<string, unknown> | null,
  key?: string | number
): JSXElement {
  return {
    $$typeof: ELEMENT_TYPE,
    type: type as string | ((props: Props) => unknown) | symbol,
    props: props ?? {},
    key: key ?? null,
  };
}

// Re-export Fragment for JSX
export { Fragment };
