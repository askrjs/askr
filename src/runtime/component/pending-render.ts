import { requestRuntimeWork } from '../access';
import { ScheduledWork } from '../scheduled-work';
import {
  getPendingCheckEpoch,
  type OwnershipRecord,
} from '../ownership/record';
import { isFineGrainedEffectStale } from '../reactivity/effect';
import type { ForState } from '../control/for-state';
import { type ComponentInstance } from './instance';
import { getLivePortalErrorParent } from './scope';

/**
 * Derived computations (`derive()` cells and `selector()` source records) are
 * evaluated eagerly in the derived lane with the closure from their owner's
 * last render. That closure is stale when a render that has not run yet may
 * remove the owner or hand it new props (#523): an ancestor component queued
 * to re-render, or a `<For>` about to reconcile the rows the owner lives in.
 * Such computations wait for that render.
 */

type DeferredComputation = {
  _dirty: boolean;
  _markDirty(): void;
};

const deferredComputations = new Set<DeferredComputation>();
// Batch work: it drains a shared set, like the derived lane itself.
const deferredWork = new ScheduledWork(requeueDeferredComputations, true);

type PendingSubject = Partial<ComponentInstance> & Partial<ForState<unknown>>;

function isForReconcilePending(forState: ForState<unknown>): boolean {
  return (
    forState._hasPendingBoundaryCommit === true ||
    (forState._sourceEffect !== null &&
      isFineGrainedEffectStale(forState._sourceEffect))
  );
}

// Lifetimes follow the render parent; portal content follows the writer,
// whose render decides the content's props.
function nextRecord(record: OwnershipRecord): OwnershipRecord | undefined {
  const subject = record.subject as PendingSubject | undefined;
  const writer = subject?._portalErrorParent
    ? getLivePortalErrorParent(subject as ComponentInstance)
    : null;
  return writer ? writer.owner : record.parent;
}

/**
 * Whether a render that has not run yet decides if `owner` survives, and with
 * which props: a lifetime ancestor (or portal writer) queued to re-render, or
 * a `<For>` that is about to reconcile. The owner's own pending update does
 * not count; it replaces the closure but keeps the owner's props.
 */
export function hasPendingOwnerRender(owner: ComponentInstance): boolean {
  const start = owner.owner.parent;
  const stamp = getPendingCheckEpoch() * 2;
  let record = start;
  let pending = false;
  while (record) {
    if (record.pendingCheck >= stamp) {
      pending = record.pendingCheck === stamp + 1;
      break;
    }
    // Provisionally clean, which also ends a cycle through portal writers.
    record.pendingCheck = stamp;
    const subject = record.subject as PendingSubject | undefined;
    if (
      subject &&
      (subject.kind === 'for'
        ? isForReconcilePending(subject as ForState<unknown>)
        : subject.hasPendingUpdate === true)
    ) {
      pending = true;
      break;
    }
    record = nextRecord(record);
  }
  if (pending) {
    for (let r = start; r && r !== record; r = nextRecord(r)) {
      r.pendingCheck = stamp + 1;
    }
    record!.pendingCheck = stamp + 1;
  }
  return pending;
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
