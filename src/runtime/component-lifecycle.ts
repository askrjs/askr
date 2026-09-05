import { isDevelopmentEnvironment } from '../common/env';
import type { ComponentInstance } from './component-internal';
import { isBulkCommitActive } from './fastlane';
import { executeCommittedLifecycleOperations } from './lifecycle-operation-settlement';
import {
  enqueueLifecycleCommitForInstance,
  type LifecycleOperation,
} from './lifecycle-batch';

export {
  beginLifecycleCommitBatch,
  captureInlineRenderSnapshot,
  discardLifecycleCommitBatch,
  drainLifecycleCommitErrors,
  finalizeInlineReadSubscriptions,
  flushLifecycleCommitBatch,
  getCurrentLifecycleCommitBatch,
  registerLifecycleRollback,
  registerLifecycleTransaction,
  type LifecycleCommitBatch,
  type LifecycleOperation,
  type LifecycleTransaction,
} from './lifecycle-batch';

export {
  discardCommitOperations,
  executeCommittedLifecycleOperations,
} from './lifecycle-operation-settlement';

export function registerMountOperationForInstance(
  instance: ComponentInstance | null,
  operation: LifecycleOperation
): void {
  if (instance) {
    // If we're in bulk-commit fast lane, registering mount operations is a
    // violation of the fast-lane preconditions. Throw in dev, otherwise ignore
    // silently in production (we must avoid scheduling work during bulk commit).
    if (isBulkCommitActive()) {
      if (isDevelopmentEnvironment()) {
        throw new Error(
          'registerMountOperation called during bulk commit fast-lane'
        );
      }
      return;
    }
    (instance.mountOperations ??= []).push(operation);
  }
}

export function registerCommitOperationForInstance(
  instance: ComponentInstance | null,
  operation: LifecycleOperation
): void {
  if (instance) {
    if (isBulkCommitActive()) {
      if (isDevelopmentEnvironment()) {
        throw new Error(
          'registerCommitOperation called during bulk commit fast-lane'
        );
      }
      return;
    }
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

  executeCommittedLifecycleOperations(instance, wasFirstMount);
}

export function commitRenderedComponent(instance: ComponentInstance): void {
  if (
    instance.ownership.mounted &&
    (instance.commitOperations?.length ?? 0) > 0
  ) {
    commitLifecycleForInstance(instance, false);
  }
}
