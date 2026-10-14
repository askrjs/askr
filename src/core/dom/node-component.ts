/** Component rendering and boundary recovery use the Pass's checkpoints. */
import type { ComponentFunction } from '../../common/component';
import type { Props } from '../../common/props';
import { reportUncaughtErrorLater } from '../../common/report-error';
import { ComponentInstance, getContextEpoch } from '../component/instance';
import { clarifyRenderError, noteErrorOrigin } from '../component/errors';
import {
  COMPONENT,
  normalizeChildren,
  type ChildDescriptor,
  type Key,
} from '../view/children';
import type { Pass } from './pass';
import { reconcileChildren, withOwner, type RenderContext } from './reconcile';
import type { ComponentNode, Parent, RNode } from './tree';
import { renderComponent, deferComponentHydration } from './node-hydration';

export function createComponent(
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

export function patchComponent(
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

function nearestComponent(
  instance: ComponentInstance
): ComponentInstance | null {
  for (let owner = instance.parent; owner; owner = owner.parent) {
    if (owner instanceof ComponentInstance) return owner;
  }
  return null;
}

/**
 * Highest `contextRevision` among `instance`'s component ancestors. Each
 * instance caches its inherited value for the current context epoch, so
 * patching every component in a deep chain stays linear. The cache relies on
 * a live instance's parent chain never changing (owners are not reparented).
 * The epoch is global, so a `provide()` anywhere invalidates every cache; the
 * worst case is the uncached O(depth) walk.
 */
function ancestorContextRevision(instance: ComponentInstance): number {
  const epoch = getContextEpoch();
  let chain: ComponentInstance[] | null = null;
  let revision = 0;
  for (let current = nearestComponent(instance); current;) {
    if (current.inheritedContextEpoch === epoch) {
      revision = Math.max(
        current.inheritedContextRevision,
        current.contextRevision
      );
      break;
    }
    (chain ??= []).push(current);
    current = nearestComponent(current);
  }
  if (!chain) return revision;
  for (let index = chain.length - 1; index >= 0; index--) {
    const ancestor = chain[index]!;
    ancestor.inheritedContextRevision = revision;
    ancestor.inheritedContextEpoch = epoch;
    revision = Math.max(revision, ancestor.contextRevision);
  }
  return revision;
}

function commitSeenAncestorContextRevision(
  pass: Pass,
  instance: ComponentInstance,
  revision: number
): void {
  pass.op(() => {
    const previous = instance.seenAncestorContextRevision;
    pass.onReversibleCommit(() => {
      instance.seenAncestorContextRevision = previous;
    });
    instance.seenAncestorContextRevision = revision;
  });
}

/** Render and reconcile a component, rewinding its boundary checkpoint on failure. */
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
    commitSeenAncestorContextRevision(ctx.pass, instance, revision);
    return children;
  } catch (caught) {
    // Convert a stack overflow where it is first caught, so boundaries and
    // error routing see the RenderDepthError.
    const error = clarifyRenderError(caught);
    const boundary = instance.boundary;
    if (!boundary) {
      noteErrorOrigin(instance.parent, error);
      throw error;
    }
    for (const failure of ctx.pass.rewind(mark)) {
      reportUncaughtErrorLater(failure);
    }
    if (!boundary(error)) throw error;
    const children = reconcileChildren(
      inner,
      node,
      componentOutput(renderComponent(ctx, node)),
      fresh
    );
    ctx.pass.markRendered(instance);
    const revision = ancestorContextRevision(instance);
    commitSeenAncestorContextRevision(ctx.pass, instance, revision);
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
    commitSeenAncestorContextRevision(ctx.pass, instance, revision);
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

export function deferHydratingRender(instance: ComponentInstance): boolean {
  return deferComponentHydration(instance, renderInstance);
}
