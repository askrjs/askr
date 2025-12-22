/**
 * Layout helper.
 *
 * A layout is just a normal component that happens to wrap routes.
 * Persistence is handled by the runtime via component identity.
 */
export type LayoutComponent<P = object> = (
  props: P & { children?: unknown }
) => unknown;

export function layout<P = object>(Layout: LayoutComponent<P>) {
  return (children?: unknown, props?: P) =>
    Layout({ ...(props as P), children });
}
