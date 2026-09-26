/**
 * Node kinds: how each kind of child is created, patched, and released.
 *
 * Creating builds DOM off-document. Patching records operations on the pass.
 * Releasing ends the lifetimes a removed node owns; the reconciler has
 * already detached its DOM.
 */

import type { ComponentFunction } from '../../common/component';
import type { Props } from '../../common/props';
import { ComponentInstance } from '../component/instance';
import { withRendering } from '../component/render-state';
import type { Owner } from '../reactive/owner';
import { Computation } from '../reactive/graph';
import { reportUncaughtErrorLater } from '../../common/report-error';
import {
  COMPONENT,
  ELEMENT,
  FRAGMENT,
  FUNCTION,
  NATIVE,
  PORTAL,
  TEXT,
  type ChildDescriptor,
  type Key,
} from '../view/children';
import type { Pass } from './pass';
import { removeUnrenderedAttributes } from './hydration';
import {
  applyInitialProps,
  applyTrailingProps,
  attachRef,
  patchProps,
  releaseProps,
} from './props';
import {
  reconcileChildren,
  withOwner,
  type NodeKinds,
  type RenderContext,
} from './reconcile';
import {
  DYNAMIC,
  HOST,
  ROOT,
  collectDom,
  type ComponentNode,
  type DynamicNode,
  type FragmentNode,
  type HostNode,
  type Parent,
  type PortalNode,
  type RNode,
} from './tree';

const SVG_NS = 'http://www.w3.org/2000/svg';
const MATHML_NS = 'http://www.w3.org/1998/Math/MathML';

/** Namespace for children of an element in namespace `ns` with tag `tag`. */
function childNamespace(tag: string, ns: string | null): string | null {
  if (tag === 'svg') return SVG_NS;
  if (tag === 'math') return MATHML_NS;
  if (ns === SVG_NS && tag === 'foreignObject') return null;
  return ns;
}

function elementNamespace(tag: string, parentNs: string | null): string | null {
  if (tag === 'svg') return SVG_NS;
  if (tag === 'math') return MATHML_NS;
  return parentNs;
}

/** Namespace new children of `parent` are created in. */
export function namespaceAt(parent: Parent): string | null {
  for (let p: Parent | null = parent; p; p = p.parent) {
    if (p.kind === HOST) return childNamespace(p.tag, namespaceOf(p.el));
    if (p.kind === ROOT)
      return childNamespace(p.el.localName, namespaceOf(p.el));
    if (p.kind === PORTAL)
      return childNamespace(p.target.localName, namespaceOf(p.target));
  }
  return null;
}

export function createRenderContext(
  pass: Pass,
  owner: Owner | null,
  ns: string | null,
  hydrate: RenderContext['hydrate'] = null
): RenderContext {
  return { pass, owner, ns, nodes: domNodes, hydrate };
}

/** Schedules a standalone update of a function child (see `updates`). */
let scheduleDynamicUpdate: (node: DynamicNode) => void = () => {};

export function setDynamicUpdateScheduler(
  schedule: (node: DynamicNode) => void
): void {
  scheduleDynamicUpdate = schedule;
}

// ---------------------------------------------------------------------------

function nearestInstance(owner: Owner | null): ComponentInstance | null {
  for (let o = owner; o; o = o.parent) {
    if (o instanceof ComponentInstance) return o;
  }
  return null;
}

function createHost(
  ctx: RenderContext,
  parent: Parent,
  key: Key | undefined,
  tag: string,
  props: Props
): HostNode {
  const ns = elementNamespace(tag, ctx.ns);
  const hydrate = ctx.hydrate;
  const adopted = hydrate
    ? hydrate.cursor.claimElement(hydrate.container, tag, ns)
    : null;
  const el =
    adopted ??
    (ns ? document.createElementNS(ns, tag) : document.createElement(tag));
  const node: HostNode = {
    kind: HOST,
    parent,
    key,
    el,
    tag,
    props,
    children: [],
    bindings: null,
    listeners: null,
    owner: nearestInstance(ctx.owner),
    imperative: Boolean(props.imperativeChildren),
  };
  applyInitialProps(ctx.pass, node, adopted !== null);
  if (adopted) {
    ctx.pass.op(() => removeUnrenderedAttributes(adopted, props));
  }
  if (ownsChildren(props)) {
    node.children = reconcileChildren(
      {
        ...ctx,
        ns: childNamespace(tag, ns),
        hydrate:
          adopted && hydrate
            ? { cursor: hydrate.cursor, container: adopted }
            : null,
      },
      node,
      props.children,
      true
    );
  }
  if (adopted) ctx.pass.op(() => applyTrailingProps(node, props));
  else applyTrailingProps(node, props);
  attachRef(ctx.pass, node, undefined);
  return node;
}

function ownsChildren(props: Props): boolean {
  return (
    !props.imperativeChildren && props.dangerouslySetInnerHTML === undefined
  );
}

function patchHost(ctx: RenderContext, node: HostNode, props: Props): void {
  const previous = node.props;
  if (previous === props) return;
  patchProps(ctx.pass, node, previous, props);
  if (ownsChildren(props)) {
    reconcileChildren(
      { ...ctx, ns: childNamespace(node.tag, namespaceOf(node.el)) },
      node,
      props.children,
      false
    );
  }
  ctx.pass.op(() => {
    node.props = props;
    node.imperative = Boolean(props.imperativeChildren);
  });
  if (node.tag === 'select') ctx.pass.op(() => applyTrailingProps(node, props));
  if (props.ref !== previous.ref) {
    attachRef(ctx.pass, { ...node, props }, previous.ref);
  }
}

function namespaceOf(el: Element): string | null {
  const uri = el.namespaceURI;
  return uri === SVG_NS || uri === MATHML_NS ? uri : null;
}

// ---------------------------------------------------------------------------
// Components

function createComponent(
  ctx: RenderContext,
  parent: Parent,
  key: Key | undefined,
  fn: ComponentFunction,
  props: Props
): ComponentNode {
  const instance = new ComponentInstance(ctx.owner, fn, props);
  ctx.pass.own(instance);
  const node: ComponentNode = {
    kind: COMPONENT,
    parent,
    key,
    instance,
    children: [],
  };
  instance.view = node;
  node.children = renderInstance(ctx, node, true);
  return node;
}

function propsChanged(previous: Props, next: Props): boolean {
  if (previous === next) return false;
  let count = 0;
  for (const key in previous) {
    count++;
    if (!(key in next) || !Object.is(previous[key], next[key])) return true;
  }
  for (const key in next) {
    void key;
    count--;
  }
  return count !== 0;
}

function patchComponent(
  ctx: RenderContext,
  node: ComponentNode,
  props: Props
): void {
  const instance = node.instance;
  if (!propsChanged(instance.props, props) && !instance.computation.stale) {
    return;
  }
  instance.setProps(props);
  renderInstance(ctx, node, false);
}

/**
 * Render a component and reconcile its output. An error boundary catches a
 * failure anywhere in its subtree: the work recorded since it started is
 * rewound and it renders again showing its fallback.
 */
export function renderInstance(
  ctx: RenderContext,
  node: ComponentNode,
  fresh: boolean
): RNode[] {
  const instance = node.instance;
  const inner = withOwner(ctx, instance);
  const mark = ctx.pass.mark();
  try {
    const children = reconcileChildren(inner, node, instance.render(), fresh);
    ctx.pass.markRendered(instance);
    return children;
  } catch (error) {
    if (!instance.boundary) throw error;
    for (const failure of ctx.pass.rewind(mark)) {
      reportUncaughtErrorLater(failure);
    }
    if (!instance.boundary(error)) throw error;
    const children = reconcileChildren(inner, node, instance.render(), fresh);
    ctx.pass.markRendered(instance);
    return children;
  }
}

// ---------------------------------------------------------------------------
// Function children

function createDynamic(
  ctx: RenderContext,
  parent: Parent,
  fn: () => unknown
): DynamicNode {
  const node = {
    kind: DYNAMIC,
    parent,
    key: undefined,
    fn,
    children: [] as RNode[],
    depth: (nearestInstance(ctx.owner)?.depth ?? 0) + 1,
  } as DynamicNode;
  node.computation = new Computation<unknown>(
    ctx.owner,
    () => withRendering(() => node.fn()),
    () => scheduleDynamicUpdate(node),
    null
  );
  ctx.pass.own(node.computation);
  node.children = reconcileChildren(
    withOwner(ctx, node.computation),
    node,
    readDynamic(node),
    true
  );
  return node;
}

/** Run a function child's read now, tracking what it reads. */
export function readDynamic(node: DynamicNode): unknown {
  const computation = node.computation;
  computation.run();
  if (computation._hasError) throw computation._error;
  return computation._value;
}

function patchDynamic(
  ctx: RenderContext,
  node: DynamicNode,
  fn: () => unknown
): void {
  const previous = node.fn;
  node.fn = fn;
  ctx.pass.onDiscard(() => {
    node.fn = previous;
  });
  reconcileChildren(
    withOwner(ctx, node.computation),
    node,
    readDynamic(node),
    false
  );
}

// ---------------------------------------------------------------------------
// Portals

function createPortal(
  ctx: RenderContext,
  parent: Parent,
  key: Key | undefined,
  target: Element,
  children: unknown
): PortalNode {
  const node: PortalNode = {
    kind: PORTAL,
    parent,
    key,
    target,
    children: [],
  };
  node.children = reconcileChildren(ctx, node, children, true);
  const created = node.children;
  ctx.pass.op(() => {
    for (const child of created) {
      for (const dom of collectDom(child)) target.appendChild(dom);
    }
  });
  return node;
}

// ---------------------------------------------------------------------------

function release(node: RNode, errors: unknown[]): void {
  switch (node.kind) {
    case HOST:
      for (const child of node.children) release(child, errors);
      releaseProps(node, errors);
      return;
    case COMPONENT:
      for (const child of node.children) release(child, errors);
      node.instance.dispose(errors);
      return;
    case DYNAMIC:
      for (const child of node.children) release(child, errors);
      node.computation.dispose(errors);
      return;
    case PORTAL:
      for (const child of node.children) {
        for (const dom of collectDom(child)) dom.parentNode?.removeChild(dom);
        release(child, errors);
      }
      return;
    case FRAGMENT:
      for (const child of node.children) release(child, errors);
      return;
    case TEXT:
    case NATIVE:
      return;
  }
}

export const domNodes: NodeKinds = {
  create(ctx, parent, child: ChildDescriptor): RNode {
    switch (child.kind) {
      case TEXT: {
        const hydrate = ctx.hydrate;
        const claimed = hydrate?.cursor.claimText(
          hydrate.container,
          child.text
        );
        if (claimed && claimed.data !== child.text) {
          const text = child.text;
          ctx.pass.op(() => {
            claimed.data = text;
          });
        }
        return {
          kind: TEXT,
          parent,
          key: undefined,
          node: claimed ?? document.createTextNode(child.text),
          text: child.text,
        };
      }
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
      case PORTAL:
        return createPortal(
          ctx,
          parent,
          child.key,
          child.target as Element,
          child.children
        );
    }
  },

  patch(ctx, node, child) {
    switch (node.kind) {
      case TEXT: {
        const text = (child as { text: string }).text;
        if (node.text !== text) {
          ctx.pass.op(() => {
            node.node.data = text;
            node.text = text;
          });
        }
        return;
      }
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
      case PORTAL:
        reconcileChildren(
          ctx,
          node,
          (child as { children: unknown }).children,
          false
        );
        return;
    }
  },

  release,
};
