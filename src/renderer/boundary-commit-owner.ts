import {
  beginLifecycleCommitBatch,
  discardLifecycleCommitBatch,
  enqueueRuntimeTask,
  flushLifecycleCommitBatch,
  registerLifecycleRollback,
  type ControlBoundaryState,
} from '../runtime';
import { getControlBoundaryCommitChildren } from './boundary-state';
import type { VNode } from './types';

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

      const lifecycleBatch = beginLifecycleCommitBatch();
      try {
        const childrenVNodes = getControlBoundaryCommitChildren(controlState);
        getCommitBoundaryChildren()(parent, controlState, childrenVNodes);
        flushLifecycleCommitBatch(lifecycleBatch);
      } catch (error) {
        discardLifecycleCommitBatch(lifecycleBatch);
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

  registerLifecycleRollback(() => {
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
  registerLifecycleRollback(() => {
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
