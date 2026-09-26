/**
 * What a render result means, independent of any host.
 *
 * `normalizeChildren()` flattens a component's return value into child
 * descriptors: text, an element, a component, a fragment, a function child
 * (fine-grained dynamic content), or a portal. The DOM renderer and the SSR
 * renderer both consume descriptors, so they cannot disagree about what a
 * value renders.
 */

import type { ComponentFunction } from '../../common/component';
import { isFragmentType } from '../../common/jsx';
import type { Props } from '../../common/props';

export const ELEMENT = 0;
export const TEXT = 1;
export const COMPONENT = 2;
export const FRAGMENT = 3;
export const FUNCTION = 4;
export const PORTAL = 6;

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
  | { kind: typeof FRAGMENT; key: Key | undefined; children: unknown }
  | { kind: typeof FUNCTION; key: undefined; fn: () => unknown }
  | {
      kind: typeof PORTAL;
      key: Key | undefined;
      target: unknown;
      children: unknown;
    };

/** Element type rendering its children into `props.target`. */
export const PORTAL_TYPE = Symbol.for('askr.core.portal');

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

/** The descriptor's identity for matching against a previous render. */
export function descriptorType(child: ChildDescriptor): unknown {
  switch (child.kind) {
    case ELEMENT:
      return child.tag;
    case COMPONENT:
      return child.fn;
    case PORTAL:
      return child.target;
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

  const vnode = value as ElementLike;
  const type = vnode.type;
  if (type === undefined) {
    if (Symbol.iterator in (value as object)) {
      for (const item of value as Iterable<unknown>) {
        normalizeChildren(item, out);
      }
      return out;
    }
    throw new Error(
      `[Askr] Objects are not valid as a child (found an object with keys ` +
        `{${Object.keys(value as object).join(', ')}}).`
    );
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
  } else if (type === PORTAL_TYPE) {
    const props = propsOf(vnode);
    out.push({
      kind: PORTAL,
      key,
      target: props.target,
      children: props.children,
    });
  } else if (isFragmentType(type)) {
    out.push({ kind: FRAGMENT, key, children: propsOf(vnode).children });
  } else {
    throw new Error(`[Askr] Unknown element type: ${String(type)}`);
  }
  return out;
}
