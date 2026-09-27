/**
 * Standalone updates: a component or function child whose own reads changed
 * re-renders in its own pass, independent of its parent.
 *
 * A failed update discards its pass and is delivered to the nearest error
 * boundary above it; without one, the error propagates to the scheduler,
 * which reports it after the flush.
 */

import { reportUncaughtErrorLater } from '../../common/report-error';
import { routeError } from '../component/errors';
import { clarifyRenderOverflow } from '../../common/render-depth';
import { type ComponentInstance, setRenderHost } from '../component/instance';
import type { Owner } from '../reactive/owner';
import { schedule, type Job } from '../reactive/scheduler';
import {
  createRenderContext,
  componentOutput,
  deferHydratingRender,
  hydrateDeferredComponent,
  isHydratingRender,
  namespaceAt,
  renderInstance,
  setDynamicUpdateScheduler,
  updateDynamic,
} from './nodes';
import { Pass } from './pass';
import { reconcileChildren, withOwner } from './reconcile';
import type { ComponentNode, DynamicNode } from './tree';

function runPass(owner: Owner | null, render: (pass: Pass) => void): void {
  const pass = new Pass();
  try {
    render(pass);
  } catch (error) {
    for (const failure of pass.discard()) reportUncaughtErrorLater(failure);
    routeError(owner, clarifyRenderOverflow(error));
    return;
  }
  try {
    pass.commit();
  } catch (error) {
    if (pass.commitAborted) routeError(owner, error);
    else throw error;
  }
}

function rerenderInstance(instance: ComponentInstance): void {
  const node = instance.view as ComponentNode | null;
  if (!node || instance.disposed || !instance.mounted) return;
  if (!instance.computation.stale) return;
  runPass(instance.parent, (pass) => {
    // Bring sources up to date; a component whose derived inputs settled to
    // the same values does not run.
    const before = instance.renderCount;
    const computation = instance.computation;
    const sources = new Set(computation._sources ?? []);
    pass.onDiscard(() => computation.restoreSources(sources));
    try {
      computation.update();
      if (computation._hasError) throw computation._error;
    } catch (error) {
      if (!instance.boundary) throw error;
    }
    if (instance.renderCount === before && !computation._hasError) return;
    const ctx = createRenderContext(
      pass,
      instance.parent,
      namespaceAt(node.parent!)
    );
    renderAfterUpdate(ctx, node);
  });
}

/**
 * The instance already ran with fresh reads; reconcile that output (or, for
 * a boundary whose render failed, render its fallback).
 */
function renderAfterUpdate(
  ctx: ReturnType<typeof createRenderContext>,
  node: ComponentNode
): void {
  const instance = node.instance;
  const computation = instance.computation;
  if (computation._hasError) {
    // Re-render through renderInstance so a boundary can catch.
    renderInstance(ctx, node, false);
    return;
  }
  const mark = ctx.pass.mark();
  try {
    if (node.deferredHydration) {
      hydrateDeferredComponent(ctx, node, componentOutput(computation._value));
      return;
    }
    reconcileChildren(
      withOwner(ctx, instance),
      node,
      componentOutput(computation._value),
      false
    );
    ctx.pass.markRendered(instance);
  } catch (caught) {
    const error = clarifyRenderOverflow(caught);
    if (!instance.boundary) throw error;
    ctx.pass.rewind(mark);
    if (!instance.boundary(error)) throw error;
    renderInstance(ctx, node, false);
  }
}

const dynamicJobs = new WeakMap<DynamicNode, Job>();

function scheduleDynamic(node: DynamicNode): void {
  let job = dynamicJobs.get(node);
  if (!job) {
    job = {
      depth: node.depth,
      run: () => rerenderDynamic(node),
      cancel: () => node.computation.dropScheduled(),
      get skip() {
        return node.computation.disposed || !node.computation.stale;
      },
    };
    dynamicJobs.set(node, job);
  }
  schedule(job, 'render');
}

function rerenderDynamic(node: DynamicNode): void {
  const computation = node.computation;
  if (computation.disposed || !computation.stale) return;
  runPass(node.instance.parent, (pass) => {
    const ctx = createRenderContext(
      pass,
      node.instance,
      namespaceAt(node.parent!)
    );
    updateDynamic(ctx, node);
  });
}

/** Bind standalone updates when a DOM root is created. */
export function installRenderUpdates(): void {
  setRenderHost({
    rerender: rerenderInstance,
    isHydrating: isHydratingRender,
    deferHydration: deferHydratingRender,
  });
  setDynamicUpdateScheduler(scheduleDynamic);
}
