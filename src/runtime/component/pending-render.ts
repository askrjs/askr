import { hasRuntimeQueuedWork, requestRuntimeWork } from '../access';
import { ScheduledWork } from '../scheduled-work';
import { type ComponentInstance } from './instance';
import { getLivePortalErrorParent } from './scope';

/**
 * Derived computations (`derive()` cells and `selector()` source records) are
 * evaluated eagerly in the derived lane with the closure from their owner's
 * last render. That closure is stale when a render that has not run yet may
 * remove the owner or hand it new props (#523): an ancestor component queued
 * to re-render, or a control boundary (`<For>`) queued to reconcile the
 * scope the owner lives in. Such computations wait for that render.
 */

type DeferredComputation = {
  _dirty: boolean;
  _markDirty(): void;
};

/** Reports whether a control boundary will reconcile this scope instance. */
const pendingBoundaryProbes = new WeakMap<ComponentInstance, () => boolean>();

const deferredComputations = new Set<DeferredComputation>();
// Batch work: it drains a shared set, like the derived lane itself.
const deferredWork = new ScheduledWork(requeueDeferredComputations, true);

/** @internal Register how a control boundary reports a pending reconcile. */
export function registerPendingBoundaryProbe(
  scopeInstance: ComponentInstance,
  probe: () => boolean
): void {
  pendingBoundaryProbes.set(scopeInstance, probe);
}

/**
 * Whether a render that has not run yet decides if `owner` survives, and with
 * which props: an ancestor (through its render parent or the portal writer)
 * queued to re-render, or a control boundary around it queued to reconcile.
 * The owner's own pending update does not count; it replaces the closure but
 * keeps the owner's props.
 *
 * `derivedCellsQueued` reports dirty derive() cells still waiting in the
 * derived lane: a `<For>` whose `each` reads a derive() chain is pending
 * before the chain has reached its source effect.
 */
export function hasPendingOwnerRender(
  owner: ComponentInstance,
  derivedCellsQueued: boolean
): boolean {
  // Every pending render or reconcile has queued work in the component lane
  // (renders, boundary commits), the reactive lane (`<For>` sources) or, for
  // a derive() chain feeding a `<For>` source, the derived lane.
  if (
    !derivedCellsQueued &&
    !hasRuntimeQueuedWork('component') &&
    !hasRuntimeQueuedWork('reactive')
  ) {
    return false;
  }
  return hasPendingRenderFrom(owner, owner, null);
}

function hasPendingRenderFrom(
  start: ComponentInstance,
  owner: ComponentInstance,
  visited: Set<ComponentInstance> | null
): boolean {
  for (
    let instance: ComponentInstance | null = start;
    instance;
    instance = instance.parentInstance
  ) {
    if (
      (instance !== owner && instance.hasPendingUpdate) ||
      pendingBoundaryProbes.get(instance)?.()
    ) {
      return true;
    }
    // Portal content renders under its host; the writer's render decides it.
    // Writer links can form cycles, so only these branches track visits.
    const writer = getLivePortalErrorParent(instance);
    if (writer) {
      visited ??= new Set();
      if (visited.has(instance)) {
        return false;
      }
      visited.add(instance);
      if (hasPendingRenderFrom(writer, owner, visited)) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Hold a dirty computation until the pending render has run. The requeue runs
 * in the component lane, behind the renders already queued: a removed owner
 * has disposed the computation by then and a re-rendered owner has
 * recomputed it (either leaves it clean). One still dirty goes back to the
 * derived lane, where it is deferred again if another render is pending.
 */
export function deferBehindPendingRender(
  computation: DeferredComputation
): void {
  deferredComputations.add(computation);
  requestRuntimeWork('component', deferredWork);
}

function requeueDeferredComputations(): void {
  const computations = Array.from(deferredComputations);
  deferredComputations.clear();
  for (const computation of computations) {
    if (computation._dirty) {
      computation._markDirty();
    }
  }
}
