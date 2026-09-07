import type { ComponentFunction, ComponentInstance } from '../runtime';
import type { ContextFrame } from '../runtime';
import type { DOMElement, VNode } from './types';

export type ElementWithContext = DOMElement & {
  [key: symbol]: ContextFrame | boolean | undefined;
  __instance?: ComponentInstance;
};

interface InstanceHostMetadata {
  __ASKR_INSTANCE?: ComponentInstance;
  __ASKR_INSTANCES?: ComponentInstance[];
  __ASKR_WRAPPER_HOST?: boolean;
}

export type InstanceHostNode = Node & InstanceHostMetadata;
export type InstanceHostElement = Element & InstanceHostMetadata;

/** Applies a component vnode to the DOM, returning the resulting node. */
export type SyncComponentElement = (
  currentDom: Node | null,
  node: ElementWithContext,
  type: ComponentFunction,
  props: Record<string, unknown>,
  parentNamespace?: string,
  forceChildrenUpdate?: boolean,
  retainedHostInstances?: Iterable<ComponentInstance>,
  hydrationRangeEnd?: Node | null,
  preserveHydrationCursorOnEmpty?: boolean
) => Node | null;

/** Applies an intrinsic vnode's props, and optionally its children, to `el`. */
export type UpdateElementFromVnode = (
  el: Element,
  vnode: VNode,
  updateChildren?: boolean,
  forceChildrenUpdate?: boolean
) => void;

/**
 * Every operation the native DOM host provides.
 *
 * Consumers take a narrowed view of this rather than restating the shared
 * method shapes, so a signature such as `syncComponentElement` is declared once
 * and the views cannot drift apart.
 */
export interface NativeDOMHost {
  createDOMNode(node: unknown, parentNamespace?: string): Node | null;
  createComponentResultNode(
    component: ComponentFunction,
    node: unknown,
    parentNamespace?: string
  ): Node | null;
  createResultNodeWithBlueprint(
    owner: object,
    vnode: unknown,
    parentNamespace?: string
  ): Node | null;
  syncComponentElement: SyncComponentElement;
  updateElementFromVnode: UpdateElementFromVnode;
  updateElementChildren(
    el: Element,
    children: VNode | VNode[] | undefined,
    forceUpdate?: boolean
  ): void;
  tryPatchStableForDirtyItem(scope: { dom?: Node; vnode?: VNode }): boolean;
}

export type RendererDOMHost = Pick<
  NativeDOMHost,
  | 'createDOMNode'
  | 'createComponentResultNode'
  | 'syncComponentElement'
  | 'updateElementFromVnode'
  | 'updateElementChildren'
  | 'tryPatchStableForDirtyItem'
>;

/** Shared message for every unconfigured host accessor. */
export const DOM_HOST_UNCONFIGURED =
  '[askr] Control boundary DOM host is not configured.';

let rendererDOMHost: RendererDOMHost | null = null;

export function configureRendererDOMHost(host: RendererDOMHost): void {
  rendererDOMHost = host;
}

export function getRendererDOMHost(): RendererDOMHost {
  if (!rendererDOMHost) {
    throw new Error('[askr] Renderer DOM host is not configured.');
  }
  return rendererDOMHost;
}
