/**
 * Function children in a component's fragment or array result.
 *
 * Inside an element, a function child is bound by the element's reactive
 * children. A component's fragment or array result has no element of its
 * own, so each function item there is rendered by a small component that
 * reads it: the reads subscribe that component, which re-renders on change.
 * The value follows the function-child rule used everywhere else: a readable
 * returned by the function is read in turn, and any other function left in
 * the result renders nothing.
 */

import {
  ELEMENT_TYPE,
  Fragment,
  isFragmentType,
  STATIC_CHILDREN,
  type JSXElement,
} from '../../common/jsx';
import { readFunctionChildValue } from '../reactivity/readable';

type VNodeLike = {
  type?: unknown;
  props?: Record<string, unknown> | null;
  children?: unknown;
};

function isFragmentNode(value: unknown): value is VNodeLike {
  return (
    !!value &&
    typeof value === 'object' &&
    'type' in value &&
    isFragmentType((value as VNodeLike).type)
  );
}

function getFragmentChildren(node: VNodeLike): unknown {
  return node.props?.children ?? node.children;
}

function withFragmentChildren(node: VNodeLike, children: unknown): VNodeLike {
  return { ...node, props: { ...node.props, children } };
}

/** Copy a child list, keeping JSX's marker that it is static (not a dynamic list). */
function copyChildList(list: unknown[]): unknown[] {
  const copy = list.slice();
  if ((list as { [STATIC_CHILDREN]?: boolean })[STATIC_CHILDREN] === true) {
    Object.defineProperty(copy, STATIC_CHILDREN, {
      value: true,
      enumerable: false,
      configurable: true,
    });
  }
  return copy;
}

/** Map the top-level items of an array or fragment, allocating only on change. */
function mapResultItems(
  value: unknown,
  mapItem: (item: unknown) => unknown
): unknown {
  if (Array.isArray(value)) {
    let mapped: unknown[] | null = null;
    for (let index = 0; index < value.length; index += 1) {
      const item = value[index];
      const next = mapResultItems(item, mapItem);
      if (next !== item) {
        mapped ??= copyChildList(value);
        mapped[index] = next;
      }
    }
    return mapped ?? value;
  }
  if (isFragmentNode(value)) {
    const children = getFragmentChildren(value);
    const next = mapResultItems(children, mapItem);
    return next === children ? value : withFragmentChildren(value, next);
  }
  return mapItem(value);
}

function renderNothingForFunction(item: unknown): unknown {
  return typeof item === 'function' ? null : item;
}

/**
 * Renders one function item of a component result (see the module comment).
 * The value is wrapped in a fragment so it renders as a transparent range,
 * like the item would have in place, rather than in a host element.
 */
export function FunctionChild(props: { read: () => unknown }): JSXElement {
  return {
    $$typeof: ELEMENT_TYPE,
    type: Fragment,
    props: {
      children: [
        mapResultItems(
          readFunctionChildValue(props.read),
          renderNothingForFunction
        ),
      ],
    },
  } as unknown as JSXElement;
}

/** Whether a vnode type is the component that renders a lifted function item. */
export function isFunctionChildType(type: unknown): boolean {
  return type === FunctionChild;
}

function toFunctionChildVNode(item: unknown): unknown {
  if (typeof item !== 'function') return item;
  return {
    $$typeof: ELEMENT_TYPE,
    type: FunctionChild,
    props: { read: item },
  };
}

/**
 * Replace each function item of a component's fragment or array result, or a
 * function passed as `children` to a transparent wrapper, with a
 * `FunctionChild` element. Returns `value` itself when there is none.
 */
export function liftFunctionChildItems(value: unknown): unknown {
  if (!Array.isArray(value) && !isFragmentNode(value)) return value;
  return mapResultItems(value, toFunctionChildVNode);
}

/** Like {@link liftFunctionChildItems}, but also lifts a lone function. */
export function liftFunctionChildren(value: unknown): unknown {
  return typeof value === 'function'
    ? [toFunctionChildVNode(value)]
    : liftFunctionChildItems(value);
}
