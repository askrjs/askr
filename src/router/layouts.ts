/**
 * Small layout helper (centralized)
 * Usage: const parent = layout(ParentLayout); route('/parent', () => parent(<Child />));
 *
 * Accepts both component-style signatures and zero-arg render factories:
 *  - `layout(ParentLayout)`
 *  - `layout(() => <ParentLayout />)`
 */
export function layout<BaseProps extends { children?: unknown }>(
  // Accept functions that optionally take props so zero-arg factories are allowed
  Base: (props?: BaseProps) => unknown
) {
  return (child?: unknown) => {
    // First, attempt to call Base with children in props (works for normal components)
    const maybe = Base({ children: child } as any);

    // If the returned value is a VNode-like object, ensure children are applied.
    if (maybe && typeof maybe === 'object' && 'type' in maybe) {
      const vnode: any = maybe;
      const props = { ...(vnode.props || {}), ...(child ? { children: child } : {}) };
      const children = child ? (Array.isArray(child) ? child : [child]) : vnode.children;
      return { ...vnode, props, children };
    }

    // If Base ignored props (zero-arg factory), call it without args and attach children if possible
    const res = Base();
    if (res && typeof res === 'object' && 'type' in res) {
      const vnode: any = res;
      const props = { ...(vnode.props || {}), ...(child ? { children: child } : {}) };
      const children = child ? (Array.isArray(child) ? child : [child]) : vnode.children;
      return { ...vnode, props, children };
    }

    // If neither returned a vnode, return the original result (fallback)
    return maybe !== undefined ? maybe : res;
  };
}
