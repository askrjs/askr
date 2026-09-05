import type { Props } from '../common/props';
import type { ContextFrame } from './context';
import type { ComponentInstance } from './component-internal';
import type { OwnershipRecord } from './ownership';
import { adoptComponentParent } from './component-capabilities';

export type InlineRenderSnapshot = {
  instance: ComponentInstance;
  props: Props;
  mounted: boolean;
  firstRenderComplete: boolean;
  ownerFrame: ContextFrame | null;
  portalScope: object | null;
  parentInstance: ComponentInstance | null;
  parentLifetime: OwnershipRecord | undefined;
  isRoot: boolean | undefined;
  vnodeParentGeneration: object | undefined;
  // Ownership-identity fields mutated by setComponentOwnershipIdentity /
  // inheritComponentCleanupStrict (component-host.ts's live-instance branch
  // of syncComponentElement) before the (throwable) render call. These must
  // roll back symmetrically with the fields above, or a render that throws
  // can leave the instance's identity self-inconsistent, causing a later
  // reconciliation pass to fail to match it and force a spurious remount.
  vnodeOwner: object | undefined;
  vnodeParent: ComponentInstance | null | undefined;
  hasVNodeKey: boolean;
  vnodeKey: string | number | undefined;
  vnodePosition: number | undefined;
  wrapperDepth: number | undefined;
  cleanupStrict: boolean | undefined;
};

export function createInlineRenderSnapshot(
  instance: ComponentInstance
): InlineRenderSnapshot {
  return {
    instance,
    props: instance.props,
    mounted: instance.ownership.mounted,
    firstRenderComplete: instance.firstRenderComplete,
    ownerFrame: instance.ownerFrame,
    portalScope: instance.portalScope,
    parentInstance: instance.parentInstance,
    parentLifetime: instance.ownership.parent,
    isRoot: instance.isRoot,
    vnodeParentGeneration: instance._vnodeParentGeneration,
    vnodeOwner: instance._vnodeOwner,
    vnodeParent: instance._vnodeParent,
    hasVNodeKey: '_vnodeKey' in instance,
    vnodeKey: instance._vnodeKey,
    vnodePosition: instance._vnodePosition,
    wrapperDepth: instance._wrapperDepth,
    cleanupStrict: instance.cleanupStrict,
  };
}

export function restoreInlineRenderSnapshot(
  snapshot: InlineRenderSnapshot
): void {
  snapshot.instance.props = snapshot.props;
  snapshot.instance.ownership.mounted = snapshot.mounted;
  snapshot.instance.firstRenderComplete = snapshot.firstRenderComplete;
  snapshot.instance.ownerFrame = snapshot.ownerFrame;
  snapshot.instance.portalScope = snapshot.portalScope;
  adoptComponentParent(
    snapshot.instance,
    snapshot.parentInstance,
    snapshot.parentLifetime ?? null
  );
  snapshot.instance.isRoot = snapshot.isRoot;
  snapshot.instance._vnodeParentGeneration = snapshot.vnodeParentGeneration;
  snapshot.instance._vnodeOwner = snapshot.vnodeOwner;
  snapshot.instance._vnodeParent = snapshot.vnodeParent;
  if (snapshot.hasVNodeKey) {
    snapshot.instance._vnodeKey = snapshot.vnodeKey;
  } else {
    delete snapshot.instance._vnodeKey;
  }
  snapshot.instance._vnodePosition = snapshot.vnodePosition;
  snapshot.instance._wrapperDepth = snapshot.wrapperDepth;
  snapshot.instance.cleanupStrict = snapshot.cleanupStrict;
}
