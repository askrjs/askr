/**
 * Layout helper.
 *
 * A layout is just a normal component that wraps children.
 * Persistence and reuse are handled by the runtime via component identity.
 *
 * This helper exists purely for readability and convention.
 */

export type LayoutComponent<P = object> = (
  props: P & { children?: unknown }
) => unknown;

export function layout<P = object>(Layout: LayoutComponent<P>) {
  return (children?: unknown, props?: P) =>
    Layout({ ...(props as P), children });
}
