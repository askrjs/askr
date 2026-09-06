import {
  beginCommitTransaction,
  discardTransaction,
  enqueueRuntimeTask,
  commitTransaction,
  registerCommitRollback,
  type ControlBoundaryState,
} from '../../runtime';
import { getControlBoundaryCommitChildren } from './state';
import type { DOMRange } from '../ownership/ranges';
import type { VNode } from '../types';

type BoundaryCommitOwnerState = ControlBoundaryState & {
  _commitOwner?: Element | null;
};

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

      const lifecycleBatch = beginCommitTransaction();
      try {
        const childrenVNodes = getControlBoundaryCommitChildren(controlState);
        getCommitBoundaryChildren()(parent, controlState, childrenVNodes);
        commitTransaction(lifecycleBatch);
      } catch (error) {
        discardTransaction(lifecycleBatch);
        throw error;
      }
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

      const lifecycleBatch = beginCommitTransaction();
      try {
        commitRange();
        commitTransaction(lifecycleBatch);
      } catch (error) {
        discardTransaction(lifecycleBatch);
        throw error;
      }
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
