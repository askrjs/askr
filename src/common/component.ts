/**
 * Common call contracts: Component signatures
 */

import type { Props } from './props';
import type { JSXElement } from './jsx';

export type ComponentContext = {
  signal: AbortSignal;
};

// Internal-ish structural contract for what component functions may return
// as plain objects. This is intentionally narrower than renderer/SSR VNode
// unions to avoid bleeding those layers into the core component signature.
export type ComponentVNode = {
  type: string;
  props?: Props;
  children?: (string | ComponentVNode | null | undefined | false)[];
};

export type ComponentFunction = (
  props: Props,
  context?: ComponentContext
) => JSXElement | ComponentVNode | string | number | null;
