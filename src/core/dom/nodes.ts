/**
 * Node kinds: how each kind of child is created, patched, and released.
 *
 * Creating builds DOM off-document. Patching records operations on the pass.
 * Releasing ends the lifetimes a removed node owns; the reconciler has
 * already detached its DOM.
 */

import type { ComponentFunction } from '../../common/component';
import type { Props } from '../../common/props';
import { isSSRPortalWriterAnchor } from '../../common/portal';
import { ComponentInstance, HookOrderChangeError } from '../component/instance';
import { noteErrorOrigin } from '../component/errors';
import type { Owner } from '../reactive/owner';
import { reportUncaughtErrorLater } from '../../common/report-error';
import { readValue } from '../reactive/readable';
import {
  COMPONENT,
  ELEMENT,
  FRAGMENT,
  FUNCTION,
  functionChildOutput,
  NATIVE,
  normalizeChildren,
  PORTAL,
  TEXT,
  type ChildDescriptor,
  type Key,
} from '../view/children';
import type { Pass } from './pass';
import { HydrationCursor, removeUnrenderedAttributes } from './hydration';
import { isDangerousInnerHTMLPayload } from './prop-values';
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
  containerOf,
  nextDomAfter,
  type ComponentNode,
  type DynamicNode,
  type FragmentNode,
  type HostNode,
  type Parent,
  type PortalNode,
  type RNode,
} from './tree';
import { reportTeardown } from './teardown';

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
  if (adopted?.hasAttribute(SKIP_HYDRATE)) {
    // Server markup that stays static until activated.
    ctx.pass.hasDormantPortalWriter ||= containsPortalWriterAnchor(adopted);
    node.dormant = { owner: ctx.owner, ns };
    ctx.pass.op(() => dormantHosts.set(adopted, node));
    return node;
  }
  applyInitialProps(ctx.pass, node, adopted !== null);
  if (adopted) {
    ctx.pass.op(() => removeUnrenderedAttributes(adopted, props));
  }
  if (!isDangerousInnerHTMLPayload(props.dangerouslySetInnerHTML)) {
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
  applyTrailingProps(ctx.pass, node, props, true, adopted !== null);
  attachRef(ctx.pass, node, undefined);
  return node;
}

const SKIP_HYDRATE = 'data-skip-hydrate';
const dormantHosts = new WeakMap<Element, HostNode>();

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
export function hydrateDormantHost(pass: Pass, node: HostNode): void {
  const dormant = node.dormant!;
  const el = node.el;
  const ctx = createRenderContext(pass, dormant.owner, dormant.ns, {
    cursor: new HydrationCursor(),
    container: el,
  });
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
    node.dormant = null;
    dormantHosts.delete(el);
    removeUnrenderedAttributes(el, props);
  });
}

function ownsChildren(props: Props): boolean {
  return (
    !props.imperativeChildren &&
    !isDangerousInnerHTMLPayload(props.dangerouslySetInnerHTML)
  );
}

function patchHost(ctx: RenderContext, node: HostNode, props: Props): void {
  const previous = node.props;
  if (previous === props) return;
  if (node.dormant) {
    // Activation hydrates with the latest props.
    ctx.pass.op(() => {
      node.props = props;
    });
    return;
  }
  const wasManaged = ownsChildren(previous);
  const isManaged = ownsChildren(props);
  if (wasManaged && !isManaged) {
    reconcileChildren(ctx, node, null, false);
  }
  patchProps(ctx.pass, node, previous, props);
  if (!wasManaged && isManaged && node.children.length === 0) {
    ctx.pass.op(() => node.el.replaceChildren());
  }
  if (isManaged) {
    reconcileChildren(
      { ...ctx, ns: childNamespace(node.tag, namespaceOf(node.el)) },
      node,
      props.children,
      false
    );
    if (
      props.children === undefined ||
      props.children === null ||
      props.children === false
    ) {
      ctx.pass.op(() => {
        if (node.el.firstChild) node.el.replaceChildren();
      });
    }
  }
  ctx.pass.op(() => {
    node.props = props;
    node.imperative = Boolean(props.imperativeChildren);
  });
  if (node.tag === 'select')
    ctx.pass.op(() => applyTrailingProps(ctx.pass, node, props));
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
  if (
    !propsChanged(instance.props, props) &&
    !instance.computation.stale &&
    !instance.computation._hasError &&
    instance.seenAncestorContextRevision === ancestorContextRevision(instance)
  ) {
    return;
  }
  instance.setProps(props);
  renderInstance(ctx, node, false);
}

function ancestorContextRevision(instance: ComponentInstance): number {
  let revision = 0;
  for (let owner = instance.parent; owner; owner = owner.parent) {
    if (owner instanceof ComponentInstance) {
      revision = Math.max(revision, owner.contextRevision);
    }
  }
  return revision;
}

/**
 * Render a component and reconcile its output. An error boundary catches a
 * failure anywhere in its subtree: the work recorded since it started is
 * rewound and it renders again showing its fallback.
 */
/** The component rendering now while its root hydrates. */
let hydratingRender: { ctx: RenderContext; node: ComponentNode } | null = null;

function renderComponent(ctx: RenderContext, node: ComponentNode): unknown {
  const previous = hydratingRender;
  hydratingRender = ctx.hydrate ? { ctx, node } : null;
  try {
    return node.instance.render((undo) => ctx.pass.onDiscard(undo));
  } finally {
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
export function deferHydratingRender(instance: ComponentInstance): boolean {
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
    const retained = new Set(next.flatMap((child) => collectDom(child)));
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
    node.children = next;
    node.deferredHydration = null;
  });
  ctx.pass.markRendered(node.instance);
}

export function renderInstance(
  ctx: RenderContext,
  node: ComponentNode,
  fresh: boolean
): RNode[] {
  const instance = node.instance;
  const inner = withOwner(ctx, instance);
  const mark = ctx.pass.mark();
  try {
    const output = renderComponent(ctx, node);
    if (instance.mounted) {
      ctx.pass.onDiscard(() => {
        if (ctx.pass.commitAborted) instance.computation.deferRetry();
        else instance.computation.invalidate();
      });
    }
    const children = reconcileComponentOutput(inner, node, output, fresh);
    ctx.pass.markRendered(instance);
    const revision = ancestorContextRevision(instance);
    ctx.pass.op(() => {
      instance.seenAncestorContextRevision = revision;
    });
    return children;
  } catch (error) {
    if (!instance.boundary) {
      noteErrorOrigin(instance.parent, error);
      throw error;
    }
    for (const failure of ctx.pass.rewind(mark)) {
      reportUncaughtErrorLater(failure);
    }
    if (!instance.boundary(error)) throw error;
    const children = reconcileChildren(
      inner,
      node,
      componentOutput(renderComponent(ctx, node)),
      fresh
    );
    ctx.pass.markRendered(instance);
    const revision = ancestorContextRevision(instance);
    ctx.pass.op(() => {
      instance.seenAncestorContextRevision = revision;
    });
    return children;
  }
}

/**
 * A component that returns the same component type directly can form a very
 * deep transparent chain. Walk the hook-free part of that chain explicitly;
 * all other output still goes through the ordinary child reconciler.
 */
function reconcileComponentOutput(
  ctx: RenderContext,
  node: ComponentNode,
  value: unknown,
  fresh: boolean
): RNode[] {
  let output = componentOutput(value);
  let current = node;
  let inner = ctx;
  let creating = fresh;
  const rendered: ComponentNode[] = [];

  for (;;) {
    const next =
      current.instance.hooks.length === 0 && !current.instance.boundary
        ? selfChild(output, current.instance.fn)
        : null;
    if (!next) {
      const children = reconcileChildren(inner, current, output, creating);
      if (creating) current.children = children;
      break;
    }

    let child: ComponentNode;
    if (creating) {
      const instance = new ComponentInstance(
        current.instance,
        next.fn,
        next.props
      );
      ctx.pass.own(instance);
      child = {
        kind: COMPONENT,
        parent: current,
        key: next.key,
        instance,
        children: [],
      };
      instance.view = child;
      current.children = [child];
    } else {
      const previous = current.children;
      if (
        previous.length !== 1 ||
        previous[0].kind !== COMPONENT ||
        previous[0].key !== next.key ||
        previous[0].instance.fn !== next.fn
      ) {
        reconcileChildren(inner, current, output, false);
        break;
      }
      child = previous[0];
      const instance = child.instance;
      if (
        !propsChanged(instance.props, next.props) &&
        !instance.computation.stale &&
        !instance.computation._hasError &&
        instance.seenAncestorContextRevision ===
          ancestorContextRevision(instance)
      ) {
        break;
      }
      instance.setProps(next.props);
    }

    const instance = child.instance;
    rendered.push(child);
    inner = withOwner(inner, instance);
    current = child;
    output = componentOutput(renderComponent(inner, child));
    if (instance.mounted) {
      ctx.pass.onDiscard(() => {
        if (ctx.pass.commitAborted) instance.computation.deferRetry();
        else instance.computation.invalidate();
      });
    }
    creating = fresh;
  }

  for (let i = rendered.length - 1; i >= 0; i--) {
    const instance = rendered[i].instance;
    ctx.pass.markRendered(instance);
    const revision = ancestorContextRevision(instance);
    ctx.pass.op(() => {
      instance.seenAncestorContextRevision = revision;
    });
  }
  return node.children;
}

function selfChild(
  output: unknown,
  fn: ComponentFunction
): Extract<ChildDescriptor, { kind: typeof COMPONENT }> | null {
  if (
    !output ||
    typeof output !== 'object' ||
    Array.isArray(output) ||
    (output as { type?: unknown }).type !== fn
  ) {
    return null;
  }
  const children = normalizeChildren(output);
  return children.length === 1 && children[0].kind === COMPONENT
    ? children[0]
    : null;
}

/** A function returned by a component is a value, not a child slot. */
export function componentOutput(value: unknown): unknown {
  return typeof value === 'function' ? null : value;
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
  node.instance = new ComponentInstance(
    ctx.owner,
    () =>
      functionChildOutput(readValue(node.fn)) as ReturnType<ComponentFunction>,
    {},
    () => scheduleDynamicUpdate(node)
  );
  node.computation = node.instance.computation;
  ctx.pass.own(node.instance);
  node.children = reconcileChildren(
    withOwner(ctx, node.instance),
    node,
    readDynamic(node),
    true,
    false
  );
  ctx.pass.markRendered(node.instance);
  return node;
}

/** Run a function child's read now, tracking what it reads. */
export function readDynamic(node: DynamicNode, pass?: Pass): unknown {
  const output = node.instance.render(
    pass ? (undo) => pass.onDiscard(undo) : undefined
  );
  if (pass && node.instance.mounted) {
    pass.onDiscard(() => {
      if (pass.commitAborted) node.computation.deferRetry();
      else node.computation.invalidate();
    });
  }
  return componentOutput(output);
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
  updateDynamic(ctx, node);
}

/** Reconcile a function child, remounting only when its own hooks change. */
export function updateDynamic(ctx: RenderContext, node: DynamicNode): void {
  const mark = ctx.pass.mark();
  try {
    reconcileChildren(
      withOwner(ctx, node.instance),
      node,
      readDynamic(node, ctx.pass),
      false,
      false
    );
    ctx.pass.markRendered(node.instance);
  } catch (error) {
    if (
      !(error instanceof HookOrderChangeError) ||
      error.instance !== node.instance
    ) {
      throw error;
    }
    for (const failure of ctx.pass.rewind(mark))
      reportUncaughtErrorLater(failure);
    const slot = ctx.pass.reserve();
    const replacement = createDynamic(
      withOwner(ctx, node.instance.parent),
      node.parent!,
      node.fn
    );
    ctx.pass.fill(slot, () => {
      const parent = node.parent!;
      const container = containerOf(parent);
      const next = nextDomAfter(node);
      const oldDom = collectDom(node);
      const errors: unknown[] = [];
      for (const dom of oldDom) dom.parentNode?.removeChild(dom);
      release(node, errors);
      parent.children[parent.children.indexOf(node)] = replacement;
      for (const dom of collectDom(replacement))
        container.insertBefore(dom, next);
      reportTeardown(errors);
    });
  }
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
  const pending: Array<{ node: RNode; finish: boolean; detach?: boolean }> = [
    { node, finish: false },
  ];
  while (pending.length) {
    const frame = pending.pop()!;
    const current = frame.node;
    if (frame.finish) {
      if (current.kind === HOST) {
        if (current.dormant) dormantHosts.delete(current.el);
        releaseProps(current, errors);
      }
      if (current.kind === COMPONENT || current.kind === DYNAMIC) {
        current.instance.dispose(errors);
      }
      continue;
    }
    if (frame.detach) {
      for (const dom of collectDom(current)) dom.parentNode?.removeChild(dom);
    }
    if (current.kind === TEXT || current.kind === NATIVE) continue;
    pending.push({ node: current, finish: true });
    for (let i = current.children.length - 1; i >= 0; i--) {
      pending.push({
        node: current.children[i],
        finish: false,
        detach: current.kind === PORTAL,
      });
    }
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
