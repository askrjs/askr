/**
 * What a render result means, independent of any host.
 *
 * `normalizeChildren()` flattens a component's return value into child
 * descriptors: text, an element, a component, a fragment, a function child
 * (fine-grained dynamic content), or a native DOM node. The DOM renderer and the SSR
 * renderer both consume descriptors, so they cannot disagree about what a
 * value renders.
 */

import type { ComponentFunction } from '../../common/component';
import { STATIC_CHILDREN, isFragmentType } from '../../common/jsx';
import type { Props } from '../../common/props';

export const ELEMENT = 0;
export const TEXT = 1;
export const COMPONENT = 2;
export const FRAGMENT = 3;
export const FUNCTION = 4;
/** A host node supplied directly as a child (e.g. an ErrorBoundary fallback). */
export const NATIVE = 7;
/** Explicitly adopted DOM node, used by an error-boundary fallback. */
export const NATIVE_TYPE = Symbol.for('askr.core.native');

export type Key = string | number | symbol;

export type ChildDescriptor =
  | { kind: typeof TEXT; key: undefined; text: string }
  | { kind: typeof ELEMENT; key: Key | undefined; tag: string; props: Props }
  | {
      kind: typeof COMPONENT;
      key: Key | undefined;
      fn: ComponentFunction;
      props: Props;
    }
  | {
      kind: typeof FRAGMENT;
      key: Key | undefined;
      children: unknown;
      /** Lifetime owner for the children, when not the rendering component. */
      owner?: unknown;
    }
  | { kind: typeof FUNCTION; key: undefined; fn: () => unknown }
  | { kind: typeof NATIVE; key: undefined; node: object };

/**
 * Element type rendering its children in place but owned by `props.owner`:
 * portal content lives at its host's position and in its writer's lifetime.
 */
export const OWNED_TYPE = Symbol.for('askr.core.owned');

interface ElementLike {
  type?: unknown;
  props?: Props | null;
  key?: unknown;
  children?: unknown;
}

function propsOf(vnode: ElementLike): Props {
  const props = (vnode.props ?? {}) as Props;
  if (props.children === undefined && vnode.children !== undefined) {
    return { ...props, children: vnode.children };
  }
  return props;
}

function keyOf(vnode: ElementLike): Key | undefined {
  const key = vnode.key ?? vnode.props?.key;
  return key === null || key === undefined ? undefined : (key as Key);
}

function isHostNode(value: object): boolean {
  return typeof Node !== 'undefined' && value instanceof Node;
}

/** A function child's result treats nested functions as values. */
export function functionChildOutput(value: unknown): unknown {
  if (typeof value === 'function') return null;
  if (Array.isArray(value)) {
    const mapped = value.map(functionChildOutput);
    // Keep the static-children mark so a JSX child list stays one.
    if ((value as { [STATIC_CHILDREN]?: boolean })[STATIC_CHILDREN]) {
      Object.defineProperty(mapped, STATIC_CHILDREN, { value: true });
    }
    return mapped;
  }
  if (value && typeof value === 'object') {
    const vnode = value as ElementLike;
    if (isFragmentType(vnode.type)) {
      const props = propsOf(vnode);
      return {
        ...vnode,
        props: { ...props, children: functionChildOutput(props.children) },
      };
    }
  }
  return value;
}

/** The descriptor's identity for matching against a previous render. */
export function descriptorType(child: ChildDescriptor): unknown {
  switch (child.kind) {
    case ELEMENT:
      return child.tag;
    case COMPONENT:
      return child.fn;
    case NATIVE:
      return child.node;
    default:
      return child.kind;
  }
}

export function normalizeChildren(
  value: unknown,
  out: ChildDescriptor[] = []
): ChildDescriptor[] {
  if (value === null || value === undefined || typeof value === 'boolean') {
    return out;
  }
  switch (typeof value) {
    case 'string':
      out.push({ kind: TEXT, key: undefined, text: value });
      return out;
    case 'number':
    case 'bigint':
      out.push({ kind: TEXT, key: undefined, text: String(value) });
      return out;
    case 'function':
      out.push({
        kind: FUNCTION,
        key: undefined,
        fn: value as () => unknown,
      });
      return out;
    case 'object':
      break;
    default:
      out.push({ kind: TEXT, key: undefined, text: String(value) });
      return out;
  }

  if (Array.isArray(value)) {
    for (const item of value) normalizeChildren(item, out);
    return out;
  }

  if (isHostNode(value)) {
    // Imperative nodes are not JSX children. A boundary fallback wraps the
    // node explicitly so it can still be adopted at its own position.
    return out;
  }

  const vnode = value as ElementLike;
  const type = vnode.type;
  if (type === undefined) {
    if (Symbol.iterator in (value as object)) {
      for (const item of value as Iterable<unknown>) {
        normalizeChildren(item, out);
      }
      return out;
    }
    // Plain data objects have no visual representation. A surrounding array
    // can still contain renderable siblings after one of these values.
    return out;
  }

  const key = keyOf(vnode);
  if (typeof type === 'string') {
    out.push({ kind: ELEMENT, key, tag: type, props: propsOf(vnode) });
  } else if (typeof type === 'function') {
    out.push({
      kind: COMPONENT,
      key,
      fn: type as ComponentFunction,
      props: propsOf(vnode),
    });
  } else if (type === OWNED_TYPE) {
    const props = propsOf(vnode);
    out.push({
      kind: FRAGMENT,
      key,
      children: props.children,
      owner: props.owner,
    });
  } else if (isFragmentType(type)) {
    out.push({ kind: FRAGMENT, key, children: propsOf(vnode).children });
  } else if (type === NATIVE_TYPE) {
    out.push({
      kind: NATIVE,
      key: undefined,
      node: propsOf(vnode).node as object,
    });
  } else {
    throw new Error(`[Askr] Unknown element type: ${String(type)}`);
  }
  return out;
}
