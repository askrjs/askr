/** Function-child updates retain one scheduler and the existing Pass journal. */
import type { ComponentFunction } from '../../common/component';
import { reportUncaughtErrorLater } from '../../common/report-error';
import { ComponentInstance, HookOrderChangeError } from '../component/instance';
import { readValue } from '../reactive/readable';
import { functionChildOutput } from '../view/children';
import { CommitMutationError, type Pass } from './pass';
import { reconcileChildren, withOwner, type RenderContext } from './reconcile';
import {
  DYNAMIC,
  collectDom,
  containerOf,
  nextDomAfter,
  type DynamicNode,
  type Parent,
  type RNode,
} from './tree';
import { reportTeardown } from './teardown';
import { componentOutput } from './node-component';
import { nearestInstance } from './node-context';
import { release } from './node-release';

/** Schedules a standalone update of a function child (see `updates`). */
let scheduleDynamicUpdate: (node: DynamicNode) => void = () => {};

export function setDynamicUpdateScheduler(
  schedule: (node: DynamicNode) => void
): void {
  scheduleDynamicUpdate = schedule;
}

export function createDynamic(
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

export function patchDynamic(
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
      const replacementDom = collectDom(replacement);
      const index = parent.children.indexOf(node);
      ctx.pass.onReversibleCommit(
        () => {
          for (const dom of replacementDom) dom.parentNode?.removeChild(dom);
          parent.children[index] = node;
        },
        () => {
          const errors: unknown[] = [];
          for (const dom of oldDom) dom.parentNode?.removeChild(dom);
          release(node, errors);
          reportTeardown(errors);
        }
      );
      parent.children[index] = replacement;
      try {
        for (const dom of replacementDom) container.insertBefore(dom, next);
      } catch (error) {
        throw new CommitMutationError(error);
      }
    });
  }
}
