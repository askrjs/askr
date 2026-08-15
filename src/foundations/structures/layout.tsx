import type { RenderableChild } from '../../common/vnode';

/**
 * Layout helper.
 *
 * A layout is just a normal component that wraps children.
 * Persistence and reuse are handled by the runtime via component identity.
 *
 * This helper exists purely for readability and convention.
 *
 * POLICY DECISIONS (LOCKED):
 *
 * 1. Return Type is Opaque (unknown)
 *    Layout components return `unknown` to remain runtime-agnostic.
 *    The runtime owns concrete JSX element types.
 *
 * 2. Children Positioning
 *    Layout receives children as first argument (router-friendly).
 *    Props come second. This matches route layout conventions where
 *    children represent the nested route content.
 *
 * 3. Props Spreading
 *    Props are spread into the layout component. This is intentional
 *    and deterministic — no merging or composition.
 */

/** A component that receives its route children via `props.children`. */
export type LayoutComponent<P = object> = (
  props: P & { children?: RenderableChild }
) => unknown;

/**
 * Wrap a {@link LayoutComponent} so it can be invoked as `(children, props)`,
 * matching route layout conventions.
 */
export function layout<P = object>(Layout: LayoutComponent<P>) {
  return (children?: RenderableChild, props?: P) => {
    const mergedProps = { ...props, children } as P & {
      children?: RenderableChild;
    };
    return Layout(mergedProps);
  };
}
