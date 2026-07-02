/**
 * Common call contracts: Component signatures
 */

import type { JSXElement } from './jsx';
import type { Props } from './props';
import type { SSRContext } from './ssr';
import type { VNode } from './vnode';

export type ComponentContext = {
  signal: AbortSignal;
  ssr?: SSRContext;
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
) => JSXElement | VNode;
