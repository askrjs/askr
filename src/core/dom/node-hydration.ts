/** Dormant and deferred node adoption participate in the existing Pass journal. */
import { isSSRPortalWriterAnchor } from '../../common/portal';
import type { ComponentInstance } from '../component/instance';
import { NATIVE } from '../view/children';
import { CommitMutationError, type Pass } from './pass';
import { HydrationCursor, removeUnrenderedAttributes } from './hydration';
import { isDangerousInnerHTMLPayload } from './prop-values';
import { applyInitialProps, applyTrailingProps, attachRef } from './props';
import {
  reconcileChildren,
  withOwner,
  type NodeKinds,
  type RenderContext,
} from './reconcile';
import {
  collectDom,
  nextDomAfter,
  type HostNode,
  type ComponentNode,
  type RNode,
} from './tree';
import { childNamespace } from './node-context';

const SKIP_HYDRATE = 'data-skip-hydrate';
const dormantHosts = new WeakMap<Element, HostNode>();

/** Defer an adopted host while retaining rollback in the owning Pass. */
export function deferDormantHost(
  ctx: RenderContext,
  node: HostNode,
  ns: string | null
): boolean {
  const adopted = node.el;
  if (!adopted.hasAttribute(SKIP_HYDRATE)) return false;
  ctx.pass.hasDormantPortalWriter ||= containsPortalWriterAnchor(adopted);
  node.dormant = { owner: ctx.owner, ns };
  ctx.pass.op(() => {
    const previous = dormantHosts.get(adopted);
    ctx.pass.onReversibleCommit(() => {
      if (previous) dormantHosts.set(adopted, previous);
      else dormantHosts.delete(adopted);
    });
    dormantHosts.set(adopted, node);
  });
  return true;
}

export function forgetDormantHost(node: HostNode): void {
  if (node.dormant) dormantHosts.delete(node.el);
}

function containsPortalWriterAnchor(root: Element): boolean {
  const pending = Array.from(root.childNodes);
  while (pending.length) {
    const node = pending.pop()!;
    if (isSSRPortalWriterAnchor(node)) return true;
    for (const child of node.childNodes) pending.push(child);
  }
  return false;
}

/** The dormant host adopted for `el`, if it has not been activated. */
export function dormantHostFor(el: Element): HostNode | null {
  const node = dormantHosts.get(el);
  return node?.dormant ? node : null;
}

/**
 * Hydrate a dormant host in place: claim its server children, then apply
 * its props, listeners, and ref. The marker is removed when the pass
 * commits, so a failed activation leaves it for a retry.
 */
export function activateDormantHost(
  pass: Pass,
  node: HostNode,
  nodes: NodeKinds
): void {
  const dormant = node.dormant!;
  const el = node.el;
  const ctx: RenderContext = {
    pass,
    owner: dormant.owner,
    ns: dormant.ns,
    nodes,
    hydrate: { cursor: new HydrationCursor(), container: el },
  };
  const props = node.props;
  applyInitialProps(pass, node, true);
  if (!isDangerousInnerHTMLPayload(props.dangerouslySetInnerHTML)) {
    const children = reconcileChildren(
      { ...ctx, ns: childNamespace(node.tag, dormant.ns) },
      node,
      props.children,
      true
    );
    node.children = children;
    pass.onDiscard(() => {
      node.children = [];
    });
  }
  applyTrailingProps(pass, node, props, true, true);
  attachRef(pass, node, undefined);
  pass.op(() => {
    pass.onReversibleCommit(() => {
      node.dormant = dormant;
      dormantHosts.set(el, node);
    });
    try {
      removeUnrenderedAttributes(el, props, (attributes) => {
        pass.onReversibleCommit(() => {
          for (const attribute of attributes) {
            el.setAttributeNode(attribute);
          }
        });
      });
    } catch (error) {
      throw new CommitMutationError(error);
    }
    node.dormant = null;
    dormantHosts.delete(el);
  });
}

/** The component rendering now while its root hydrates. */
let hydratingRender: { ctx: RenderContext; node: ComponentNode } | null = null;

export function renderComponent(
  ctx: RenderContext,
  node: ComponentNode
): unknown {
  const previous = hydratingRender;
  hydratingRender = ctx.hydrate ? { ctx, node } : null;
  try {
    node.instance.hydrationResourceKeys = ctx.hydrate
      ? ctx.hydrate.cursor.claimResourceSlots(ctx.hydrate.container)
      : null;
    return node.instance.render((undo) => ctx.pass.onDiscard(undo));
  } finally {
    node.instance.hydrationResourceKeys = null;
    hydratingRender = previous;
  }
}

export function isHydratingRender(): boolean {
  return hydratingRender !== null;
}

/**
 * Render the hydrating component again after the rest of its root, claiming
 * the server nodes reserved at its position (portal hosts whose content is
 * written later in the same render).
 */
export function deferComponentHydration(
  instance: ComponentInstance,
  renderInstance: (
    ctx: RenderContext,
    node: ComponentNode,
    fresh: boolean
  ) => RNode[]
): boolean {
  const active = hydratingRender;
  if (!active || active.node.instance !== instance) return false;
  const { ctx, node } = active;
  const hydrate = ctx.hydrate!;
  const cursor = hydrate.cursor.reserve(hydrate.container);
  hydrate.cursor.deferred.push({
    render: () => {
      if (instance.disposed) return;
      if (!instance.computation.stale) {
        if (ctx.pass.hasDormantPortalWriter) {
          const held = cursor.heldNodes(hydrate.container);
          node.children = held.map((dom) => ({
            kind: NATIVE,
            parent: node,
            key: undefined,
            node: dom,
          }));
          node.deferredHydration = { cursor, container: hydrate.container };
        }
        return;
      }
      renderInstance(
        { ...ctx, hydrate: { cursor, container: hydrate.container } },
        node,
        true
      );
    },
  });
  return true;
}

/** Adopt held server portal output when its deferred writer first runs. */
export function hydrateDeferredComponent(
  ctx: RenderContext,
  node: ComponentNode,
  output: unknown
): void {
  const deferred = node.deferredHydration!;
  const previous = node.children;
  const next = reconcileChildren(
    withOwner({ ...ctx, hydrate: deferred }, node.instance),
    node,
    output,
    true
  );
  const container = deferred.container;
  const after = nextDomAfter(node);
  ctx.pass.op(() => {
    const previousDom = Array.from(container.childNodes);
    ctx.pass.onReversibleCommit(() => {
      try {
        restoreNodeChildren(container, previousDom);
      } finally {
        node.children = previous;
        node.deferredHydration = deferred;
      }
    });
    const retained = new Set(next.flatMap((child) => collectDom(child)));
    try {
      for (const child of previous) {
        for (const dom of collectDom(child)) {
          if (!retained.has(dom)) dom.parentNode?.removeChild(dom);
        }
      }
      let before = after;
      for (let index = next.length - 1; index >= 0; index--) {
        const doms = collectDom(next[index]);
        for (let item = doms.length - 1; item >= 0; item--) {
          const dom = doms[item];
          if (dom.parentNode !== container || dom.nextSibling !== before) {
            container.insertBefore(dom, before);
          }
          before = dom;
        }
      }
    } catch (error) {
      throw new CommitMutationError(error);
    }
    node.children = next;
    node.deferredHydration = null;
  });
  ctx.pass.markRendered(node.instance);
}

function restoreNodeChildren(container: Node, previous: readonly Node[]): void {
  for (let index = 0; index < previous.length; index += 1) {
    const current = container.childNodes[index] ?? null;
    if (current !== previous[index])
      container.insertBefore(previous[index], current);
  }
  while (container.childNodes.length > previous.length) {
    container.removeChild(container.lastChild!);
  }
}
