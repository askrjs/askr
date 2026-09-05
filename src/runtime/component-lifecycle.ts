import { runCommitTransaction } from './transaction-access';
import type { ComponentInstance } from './component-internal';
import {
  enqueueLifecycleCommitForInstance,
  type LifecycleOperation,
} from './render-transaction';

export {
  beginCommitTransaction,
  captureInlineRenderSnapshot,
  discardTransaction,
  finalizeInlineReadSubscriptions,
  commitTransaction,
  getCurrentCommitTransaction,
  registerCommitRollback,
  registerCommitEffect,
  type CommitTransaction,
  type LifecycleOperation,
  type CommitParticipant,
} from './render-transaction';

export { discardCommitOperations } from './lifecycle-operation-settlement';

export function registerMountOperationForInstance(
  instance: ComponentInstance | null,
  operation: LifecycleOperation
): void {
  if (instance) {
    (instance.mountOperations ??= []).push(operation);
  }
}

export function registerCommitOperationForInstance(
  instance: ComponentInstance | null,
  operation: LifecycleOperation
): void {
  if (instance) {
    (instance.commitOperations ??= []).push(operation);
  }
}

export function commitLifecycleForInstance(
  instance: ComponentInstance,
  wasFirstMount: boolean
): void {
  if (
    (instance.mountOperations?.length ?? 0) === 0 &&
    (instance.commitOperations?.length ?? 0) === 0
  ) {
    return;
  }

  if (enqueueLifecycleCommitForInstance(instance, wasFirstMount)) {
    return;
  }

  runCommitTransaction(() =>
    enqueueLifecycleCommitForInstance(instance, wasFirstMount)
  );
}

export function commitRenderedComponent(instance: ComponentInstance): void {
  if (instance.owner.mounted && (instance.commitOperations?.length ?? 0) > 0) {
    commitLifecycleForInstance(instance, false);
  }
}
