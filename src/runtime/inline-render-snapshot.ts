import type { ComponentInstance } from './component-internal';
import type { OwnershipRecord } from './ownership';
import { adoptComponentParent } from './component-capabilities';

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
  execution: Pick<
    ComponentInstance,
    | 'props'
    | 'firstRenderComplete'
    | 'ownerFrame'
    | 'portalScope'
    | 'isRoot'
    | '_vnodeParentGeneration'
    | '_vnodeOwner'
    | '_vnodeParent'
    | '_vnodeKey'
    | '_vnodePosition'
    | '_wrapperDepth'
    | 'cleanupStrict'
  >;
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
    execution: {
      props: instance.props,
      firstRenderComplete: instance.firstRenderComplete,
      ownerFrame: instance.ownerFrame,
      portalScope: instance.portalScope,
      isRoot: instance.isRoot,
      _vnodeParentGeneration: instance._vnodeParentGeneration,
      _vnodeOwner: instance._vnodeOwner,
      _vnodeParent: instance._vnodeParent,
      _vnodeKey: instance._vnodeKey,
      _vnodePosition: instance._vnodePosition,
      _wrapperDepth: instance._wrapperDepth,
      cleanupStrict: instance.cleanupStrict,
    },
  };
}

export function restoreInlineRenderSnapshot(
  snapshot: InlineRenderSnapshot
): void {
  Object.assign(snapshot.instance, snapshot.execution);
  snapshot.instance.owner.mounted = snapshot.mounted;
  adoptComponentParent(
    snapshot.instance,
    snapshot.parentInstance,
    snapshot.parentLifetime ?? null
  );
  if (!snapshot.hasVNodeKey) {
    delete snapshot.instance._vnodeKey;
  }
}
