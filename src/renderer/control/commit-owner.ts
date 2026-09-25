import {
  beginCommitTransaction,
  discardTransaction,
  enqueueRuntimeTask,
  commitTransaction,
  getControlOutputOwner,
  getCurrentComponentInstance,
  isRenderingProtectedBoundaryContent,
  registerCommitRollback,
  routeRenderedOutputErrorToBoundary,
  setControlOutputOwner,
  type ControlBoundaryState,
} from '../../runtime';
import { getControlBoundaryCommitChildren } from './state';
import type { DOMRange } from '../ownership/ranges';
import type { VNode } from '../types';

type BoundaryCommitOwnerState = ControlBoundaryState & {
  _commitOwner?: Element | null;
};

/** The control boundary whose local commit is running, if any. */
let activeBoundaryCommit: ControlBoundaryState | null = null;

/**
 * Remember where a control boundary is materialized so a later boundary-local
 * commit can report failures there. Outside a component render (a boundary
 * materialized by another boundary's local commit) it inherits that
 * boundary's owner; a known owner is never cleared.
 */
function recordControlOutputOwner(controlState: ControlBoundaryState): void {
  const instance = getCurrentComponentInstance();
  setControlOutputOwner(
    controlState,
    instance
      ? {
          instance,
          protectedByOwner: isRenderingProtectedBoundaryContent(instance),
        }
      : activeBoundaryCommit
        ? getControlOutputOwner(activeBoundaryCommit)
        : null
  );
}

/**
 * Run a boundary-local commit. It runs outside any component render, so a
 * failure goes to the nearest ErrorBoundary around where the boundary was
 * materialized, and is only rethrown when there is none.
 */
function runBoundaryCommit(
  controlState: ControlBoundaryState,
  commit: () => void
): void {
  const previousCommit = activeBoundaryCommit;
  activeBoundaryCommit = controlState;
  const lifecycleBatch = beginCommitTransaction();
  try {
    commit();
    commitTransaction(lifecycleBatch);
  } catch (error) {
    discardTransaction(lifecycleBatch);
    const owner = getControlOutputOwner(controlState);
    if (
      !owner ||
      !routeRenderedOutputErrorToBoundary(
        owner.instance,
        error,
        owner.protectedByOwner
      )
    ) {
      throw error;
    }
  } finally {
    activeBoundaryCommit = previousCommit;
  }
}

type CommitBoundaryChildren = (
  parent: Element,
  controlState: ControlBoundaryState,
  childrenVNodes: VNode[]
) => void;

let commitBoundaryChildren: CommitBoundaryChildren | null = null;
const controlBoundaryOwners = new WeakMap<Element, ControlBoundaryState>();

export function configureBoundaryCommitOwnerHost(
  commit: CommitBoundaryChildren
): void {
  commitBoundaryChildren = commit;
}

function getCommitBoundaryChildren(): CommitBoundaryChildren {
  if (!commitBoundaryChildren) {
    throw new Error('[askr] Control boundary commit host is not configured.');
  }
  return commitBoundaryChildren;
}

function assignControlBoundaryCommitOwner(
  parent: Element,
  controlState: ControlBoundaryState | null
): void {
  const previousOwner = controlBoundaryOwners.get(parent) as
    | BoundaryCommitOwnerState
    | undefined;
  if (previousOwner && previousOwner !== controlState) {
    previousOwner._enqueueBoundaryCommit = null;
    previousOwner._hasPendingBoundaryCommit = false;
    if (previousOwner._commitOwner === parent) {
      previousOwner._commitOwner = null;
    }
  }

  if (!controlState) {
    controlBoundaryOwners.delete(parent);
    return;
  }

  const ownerState = controlState as BoundaryCommitOwnerState;
  const previousParent = ownerState._commitOwner;
  if (
    previousParent &&
    previousParent !== parent &&
    controlBoundaryOwners.get(previousParent) === controlState
  ) {
    controlBoundaryOwners.delete(previousParent);
  }

  controlBoundaryOwners.set(parent, controlState);
  ownerState._commitOwner = parent;
  controlState._enqueueBoundaryCommit = () => {
    if (controlState._hasPendingBoundaryCommit) {
      return;
    }

    controlState._hasPendingBoundaryCommit = true;
    enqueueRuntimeTask(() => {
      controlState._hasPendingBoundaryCommit = false;

      if (controlBoundaryOwners.get(parent) !== controlState) {
        return;
      }

      runBoundaryCommit(controlState, () => {
        const childrenVNodes = getControlBoundaryCommitChildren(controlState);
        getCommitBoundaryChildren()(parent, controlState, childrenVNodes);
      });
    });
  };
}

export function clearControlBoundaryCommitOwner(parent: Element): void {
  const owner = controlBoundaryOwners.get(parent) as
    | BoundaryCommitOwnerState
    | undefined;
  if (!owner) {
    return;
  }

  registerCommitRollback(() => {
    if (!controlBoundaryOwners.has(parent)) {
      assignControlBoundaryCommitOwner(parent, owner);
    }
  });
  assignControlBoundaryCommitOwner(parent, null);
}

export function registerControlBoundaryCommitOwner(
  parent: Element,
  controlState: ControlBoundaryState
): void {
  recordControlOutputOwner(controlState);
  const previousOwner = controlBoundaryOwners.get(parent);
  if (previousOwner === controlState) {
    return;
  }

  const ownerState = controlState as BoundaryCommitOwnerState;
  const previousParent = ownerState._commitOwner;
  registerCommitRollback(() => {
    if (controlBoundaryOwners.get(parent) !== controlState) {
      return;
    }

    assignControlBoundaryCommitOwner(parent, previousOwner ?? null);
    if (previousParent && previousParent !== parent) {
      assignControlBoundaryCommitOwner(previousParent, controlState);
    }
  });

  assignControlBoundaryCommitOwner(parent, controlState);
}

export function registerControlBoundaryRangeCommitOwner(
  range: DOMRange,
  controlState: ControlBoundaryState,
  commitRange: () => void
): void {
  recordControlOutputOwner(controlState);
  const ownerState = controlState as BoundaryCommitOwnerState;
  const previousParent = ownerState._commitOwner;
  const previousEnqueue = controlState._enqueueBoundaryCommit;
  const previousPending = controlState._hasPendingBoundaryCommit;

  if (
    previousParent &&
    controlBoundaryOwners.get(previousParent) === controlState
  ) {
    controlBoundaryOwners.delete(previousParent);
  }
  ownerState._commitOwner = null;

  const enqueueRangeCommit = (): void => {
    if (
      controlState._enqueueBoundaryCommit !== enqueueRangeCommit ||
      controlState._hasPendingBoundaryCommit
    ) {
      return;
    }

    controlState._hasPendingBoundaryCommit = true;
    enqueueRuntimeTask(() => {
      controlState._hasPendingBoundaryCommit = false;
      if (
        controlState._enqueueBoundaryCommit !== enqueueRangeCommit ||
        !range.start.parentNode ||
        range.start.parentNode !== range.end.parentNode
      ) {
        return;
      }

      runBoundaryCommit(controlState, commitRange);
    });
  };

  controlState._enqueueBoundaryCommit = enqueueRangeCommit;
  controlState._hasPendingBoundaryCommit = false;

  registerCommitRollback(() => {
    if (controlState._enqueueBoundaryCommit !== enqueueRangeCommit) {
      return;
    }
    controlState._enqueueBoundaryCommit = previousEnqueue;
    controlState._hasPendingBoundaryCommit = previousPending;
    ownerState._commitOwner = previousParent ?? null;
    if (previousParent) {
      controlBoundaryOwners.set(previousParent, controlState);
    }
  });
}
