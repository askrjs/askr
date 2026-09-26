import { captureInlineExecution, restoreInlineExecution } from './state';
import type { ComponentInstance } from './instance';
import type { OwnershipRecord } from '../ownership/record';
import { adoptComponentParent } from './capabilities';

export type InlineRenderSnapshot = {
  instance: ComponentInstance;
  mounted: boolean;
  parentInstance: ComponentInstance | null;
  parentLifetime: OwnershipRecord | undefined;
  // Ownership-identity fields mutated by setComponentOwnershipIdentity /
  // inheritComponentCleanupStrict (component-host.ts's live-instance branch
  // of syncComponentElement) before the (throwable) render call. These must
  // roll back symmetrically with the fields above, or a render that throws
  // can leave the instance's identity self-inconsistent, causing a later
  // reconciliation pass to fail to match it and force a spurious remount.
  hasVNodeKey: boolean;
  execution: ReturnType<typeof captureInlineExecution>;
  /** Whether an update was queued; an inline render consumes it. */
  hasPendingUpdate: boolean;
};

export function createInlineRenderSnapshot(
  instance: ComponentInstance
): InlineRenderSnapshot {
  return {
    instance,
    mounted: instance.owner.mounted,
    parentInstance: instance.parentInstance,
    parentLifetime: instance.owner.parent,
    hasVNodeKey: '_vnodeKey' in instance,
    execution: captureInlineExecution(instance),
    hasPendingUpdate: instance.hasPendingUpdate,
  };
}

/**
 * Undo a render that rolled back. An update the instance was due when that
 * render took it over (a queued run, or a scheduled render it superseded) is
 * not dropped: the instance renders again, so it still catches up with the
 * state it reads, like a fine-grained binding does after a rollback.
 */
export function restoreInlineRenderSnapshot(
  snapshot: InlineRenderSnapshot
): void {
  const { instance } = snapshot;
  restoreInlineExecution(instance, snapshot.execution, snapshot.hasVNodeKey);
  instance.owner.mounted = snapshot.mounted;
  adoptComponentParent(
    instance,
    snapshot.parentInstance,
    snapshot.parentLifetime ?? null
  );
  // See runScheduledComponent: its superseded apply re-queues the instance.
  instance._rolledBackRevision = instance.renderRevision;
  if (snapshot.hasPendingUpdate && !instance.hasPendingUpdate)
    instance._enqueueRun?.();
}
