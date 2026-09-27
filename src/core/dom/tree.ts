import type { Owner } from '../reactive/owner';
/**
 * The rendered tree: the renderer's record of what each child slot produced
 * and where its DOM lives. It is the only owner of DOM position.
 *
 * A component, fragment, or function child has no DOM of its own; its DOM is
 * its children's. A multi-node result therefore needs no wrapper element and
 * no marker comments: its nodes are found by walking its children, and the
 * insertion point after it by walking its following siblings.
 *
 * Lifetimes are not tracked here. A node points at the Owner that holds its
 * lifetime (a component instance, a binding, a function child's
 * computation); the Owner tree is the only lifetime authority.
 */

import type { Props } from '../../common/props';
import type { ComponentInstance } from '../component/instance';
import type { Computation } from '../reactive/graph';
import {
  COMPONENT,
  ELEMENT,
  FRAGMENT,
  FUNCTION,
  NATIVE,
  TEXT,
  type Key,
} from '../view/children';
import type { ListenerMap } from './events';
import type { HydrationCursor } from './hydration';

export { COMPONENT, FRAGMENT, NATIVE, TEXT, type Key };
export const HOST = ELEMENT;
export const DYNAMIC = FUNCTION;
export const ROOT = 5;

interface Base {
  parent: Parent | null;
  key: Key | undefined;
}

export interface HostNode extends Base {
  kind: typeof HOST;
  el: Element;
  tag: string;
  props: Props;
  children: RNode[];
  /** Fine-grained prop bindings; each is owned by `owner`. */
  bindings: Map<string, Computation<void>> | null;
  listeners: ListenerMap | null;
  /** Component whose render produced this element. */
  owner: ComponentInstance | null;
  /** Descendants belong to imperative code; children are not reconciled. */
  imperative: boolean;
  /**
   * Adopted server markup whose hydration is skipped or deferred
   * (`data-skip-hydrate`): props and children wait for activation.
   */
  dormant?: { owner: Owner | null; ns: string | null } | null;
}

export interface TextNode extends Base {
  kind: typeof TEXT;
  node: Text;
  text: string;
}

/** A DOM node supplied directly as a child; adopted as-is. */
export interface NativeNode extends Base {
  kind: typeof NATIVE;
  node: Node;
}

export interface ComponentNode extends Base {
  kind: typeof COMPONENT;
  instance: ComponentInstance;
  children: RNode[];
  /** Server portal output held until a deferred writer hydrates. */
  deferredHydration?: { cursor: HydrationCursor; container: Node } | null;
}

export interface FragmentNode extends Base {
  kind: typeof FRAGMENT;
  children: RNode[];
}

export interface DynamicNode extends Base {
  kind: typeof DYNAMIC;
  fn: () => unknown;
  instance: ComponentInstance;
  /** Reads `fn()`; owns the content it renders. */
  computation: Computation<unknown>;
  children: RNode[];
  depth: number;
}

export interface RootNode {
  kind: typeof ROOT;
  el: Element;
  children: RNode[];
  parent: null;
  key: undefined;
  /** Existing node the root's content is inserted before, if any. */
  tail: Node | null;
}

export type RNode =
  | HostNode
  | TextNode
  | NativeNode
  | ComponentNode
  | FragmentNode
  | DynamicNode;

export type Parent =
  | HostNode
  | ComponentNode
  | FragmentNode
  | DynamicNode
  | RootNode;

/** Parents whose children are DOM children of one element. */
export function isContainer(parent: Parent): parent is HostNode | RootNode {
  return parent.kind === HOST || parent.kind === ROOT;
}

export function containerElement(parent: HostNode | RootNode): Element {
  return parent.el;
}

/** The element that directly contains `parent`'s DOM. */
export function containerOf(parent: Parent): Element {
  for (let p: Parent | null = parent; p; p = p.parent) {
    if (isContainer(p)) return containerElement(p);
  }
  throw new Error('[Askr] Rendered node is not attached to a container.');
}

export function firstDom(node: RNode): Node | null {
  const pending: RNode[] = [node];
  while (pending.length) {
    const current = pending.pop()!;
    switch (current.kind) {
      case HOST:
        return current.el;
      case TEXT:
      case NATIVE:
        return current.node;
      default:
        for (let i = current.children.length - 1; i >= 0; i--) {
          pending.push(current.children[i]);
        }
    }
  }
  return null;
}

export function collectDom(node: RNode, out: Node[] = []): Node[] {
  const pending: RNode[] = [node];
  while (pending.length) {
    const current = pending.pop()!;
    switch (current.kind) {
      case HOST:
        out.push(current.el);
        break;
      case TEXT:
      case NATIVE:
        out.push(current.node);
        break;
      default:
        for (let i = current.children.length - 1; i >= 0; i--) {
          pending.push(current.children[i]);
        }
    }
  }
  return out;
}

/**
 * The DOM node that content at the end of `parent` must be inserted before:
 * null for an element's children, otherwise the first DOM after `parent`.
 */
export function endOf(parent: Parent): Node | null {
  if (parent.kind === ROOT) {
    return parent.tail?.parentNode === parent.el ? parent.tail : null;
  }
  if (isContainer(parent)) return null;
  return nextDomAfter(parent);
}

/** The first DOM node after `node`'s own DOM within its container. */
export function nextDomAfter(node: RNode): Node | null {
  let current: RNode = node;
  for (let parent = current.parent; parent; parent = current.parent) {
    const siblings = parent.children;
    for (let i = siblings.indexOf(current) + 1; i < siblings.length; i++) {
      const dom = firstDom(siblings[i]);
      if (dom) return dom;
    }
    if (parent.kind === ROOT) {
      return parent.tail?.parentNode === parent.el ? parent.tail : null;
    }
    if (isContainer(parent)) return null;
    current = parent;
  }
  return null;
}
