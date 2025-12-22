/**
 * JSX dev runtime factory
 * Same element shape as production runtime, with room for dev warnings.
 */

import './types';
import { ELEMENT_TYPE, Fragment, JSXElement } from './types';

export function jsxDEV(
  type: unknown,
  props: Record<string, unknown> | null,
  key?: string | number
): JSXElement {
  return {
    $$typeof: ELEMENT_TYPE,
    type,
    props: props ?? {},
    key: key ?? null,
  };
}

// Re-export Fragment for JSX
export { Fragment };
