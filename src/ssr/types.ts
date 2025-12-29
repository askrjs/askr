/**
 * Shared SSR types
 */

import type { JSXElement } from '../common/jsx';
import type { Props } from '../common/props';
import type { RenderContext } from './context';

/** VNode representation for SSR rendering */
export type VNode = {
  type: string | SSRComponent;
  props?: Props;
  children?: unknown[];
};

/**
 * Component function signature for SSR.
 * Components receive props and an optional context with signal and SSR context.
 */
export type SSRComponent = (
  props: Props,
  context?: { signal?: AbortSignal; ssr?: RenderContext }
) => VNode | JSXElement | string | number | boolean | null;
