import type {
  ComponentFunction,
  ComponentInstance,
} from '../runtime/component-contracts';
import type { ContextFrame } from '../runtime/context';
import type { DOMElement, VNode } from './types';

export type ElementWithContext = DOMElement & {
  [key: symbol]: ContextFrame | boolean | undefined;
  __instance?: ComponentInstance;
};

export type InstanceHostElement = Element & {
  __ASKR_INSTANCE?: ComponentInstance;
  __ASKR_INSTANCES?: ComponentInstance[];
  __ASKR_WRAPPER_HOST?: boolean;
};

export interface RendererDOMHost {
  createDOMNode(node: unknown, parentNamespace?: string): Node | null;
  syncComponentElement(
    currentDom: Node | null,
    node: ElementWithContext,
    type: ComponentFunction,
    props: Record<string, unknown>,
    parentNamespace?: string,
    forceChildrenUpdate?: boolean,
    retainedHostInstances?: Iterable<ComponentInstance>
  ): Node | null;
  updateElementFromVnode(
    el: Element,
    vnode: VNode,
    updateChildren?: boolean,
    forceChildrenUpdate?: boolean
  ): void;
  updateElementChildren(
    el: Element,
    children: VNode | VNode[] | undefined,
    forceUpdate?: boolean
  ): void;
  tryPatchStableForDirtyItem(scope: { dom?: Node; vnode?: VNode }): boolean;
}

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
