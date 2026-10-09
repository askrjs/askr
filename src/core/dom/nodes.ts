/**
 * DOM node dispatch. Implementations receive the same RenderContext/Pass;
 * commit, undo, discard and cleanup ordering remain owned by the Pass.
 */
import type { Owner } from '../reactive/owner';
import type { Props } from '../../common/props';
import {
  COMPONENT,
  ELEMENT,
  FRAGMENT,
  FUNCTION,
  NATIVE,
  TEXT,
  type ChildDescriptor,
} from '../view/children';
import type { Pass } from './pass';
import {
  reconcileChildren,
  withOwner,
  type NodeKinds,
  type RenderContext,
} from './reconcile';
import {
  DYNAMIC,
  HOST,
  type FragmentNode,
  type HostNode,
  type RNode,
} from './tree';
import { createHost, patchHost } from './node-host';
import { createText, patchText } from './node-text';
import { createComponent, patchComponent } from './node-component';
import { createDynamic, patchDynamic } from './node-dynamic';
import { activateDormantHost } from './node-hydration';
import { syncEnclosingSelect } from './node-select';
import { release } from './node-release';

export { namespaceAt } from './node-context';
export {
  componentOutput,
  deferHydratingRender,
  renderInstance,
} from './node-component';
export {
  readDynamic,
  setDynamicUpdateScheduler,
  updateDynamic,
} from './node-dynamic';
export {
  dormantHostFor,
  hydrateDeferredComponent,
  isHydratingRender,
} from './node-hydration';

export function hydrateDormantHost(pass: Pass, node: HostNode): void {
  activateDormantHost(pass, node, domNodes);
}

export function createRenderContext(
  pass: Pass,
  owner: Owner | null,
  ns: string | null,
  hydrate: RenderContext['hydrate'] = null
): RenderContext {
  return { pass, owner, ns, nodes: domNodes, hydrate };
}

export const domNodes: NodeKinds = {
  listChanged(ctx, parent) {
    syncEnclosingSelect(ctx.pass, parent);
  },
  create(ctx, parent, child: ChildDescriptor): RNode {
    switch (child.kind) {
      case TEXT:
        return createText(ctx, parent, child.text);
      case ELEMENT:
        return createHost(ctx, parent, child.key, child.tag, child.props);
      case COMPONENT:
        return createComponent(ctx, parent, child.key, child.fn, child.props);
      case FRAGMENT: {
        const node: FragmentNode = {
          kind: FRAGMENT,
          parent,
          key: child.key,
          children: [],
        };
        node.children = reconcileChildren(
          withOwner(ctx, (child.owner as Owner | undefined) ?? ctx.owner),
          node,
          child.children,
          true
        );
        return node;
      }
      case FUNCTION:
        return createDynamic(ctx, parent, child.fn);
      case NATIVE:
        return {
          kind: NATIVE,
          parent,
          key: undefined,
          node: child.node as Node,
        };
    }
  },

  patch(ctx, node, child) {
    switch (node.kind) {
      case TEXT:
        patchText(ctx, node, (child as { text: string }).text);
        return;
      case HOST:
        patchHost(ctx, node, (child as { props: Props }).props);
        return;
      case COMPONENT:
        patchComponent(ctx, node, (child as { props: Props }).props);
        return;
      case DYNAMIC:
        patchDynamic(ctx, node, (child as { fn: () => unknown }).fn);
        return;
      case NATIVE:
        return;
      case FRAGMENT: {
        const owner = (child as { owner?: Owner }).owner;
        reconcileChildren(
          withOwner(ctx, owner ?? ctx.owner),
          node,
          (child as { children: unknown }).children,
          false
        );
        return;
      }
    }
  },

  release,
};
