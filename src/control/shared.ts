import { Fragment } from '../common/jsx';
import type { DOMElement, VNode } from '../common/vnode';

export function normalizeBoundaryChild(value: unknown): VNode | null {
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return null;
    }
    if (value.length === 1) {
      return normalizeBoundaryChild(value[0]);
    }
    return {
      type: Fragment,
      props: {
        children: value,
      },
    } as DOMElement;
  }

  return (value ?? null) as VNode | null;
}

export function resolveMaybeAccessor<T>(value: T | (() => T)): T {
  return typeof value === 'function' ? (value as () => T)() : value;
}
