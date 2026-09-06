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
  };
}

export function restoreInlineRenderSnapshot(
  snapshot: InlineRenderSnapshot
): void {
  restoreInlineExecution(
    snapshot.instance,
    snapshot.execution,
    snapshot.hasVNodeKey
  );
  snapshot.instance.owner.mounted = snapshot.mounted;
  adoptComponentParent(
    snapshot.instance,
    snapshot.parentInstance,
    snapshot.parentLifetime ?? null
  );
}
