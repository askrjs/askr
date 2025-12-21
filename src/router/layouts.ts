/**
 * Small layout helper (centralized)
 * Usage: const parent = layout(ParentLayout); route('/parent', () => parent(<Child />));
 *
 * A layout is simply a component that receives `children`.
 * This helper intentionally avoids vnode inspection, heuristics, or double-invocation.
 * Prefer boring, explicit code over cleverness.
 *
 * Example:
 * const Parent = ({ children }: { children?: unknown }) => <div class="parent">{children}</div>;
 * const parent = layout(Parent);
 * route('/parent', () => parent(<div class="child">C</div>));
 */
export type Component<P = {}> = (props: P & { children?: unknown }) => unknown;

export function layout<P>(Layout: Component<P>) {
  return (children?: unknown) =>
    Layout({ children } as P & { children?: unknown });
}
