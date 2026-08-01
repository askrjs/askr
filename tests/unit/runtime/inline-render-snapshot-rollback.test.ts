import { describe, expect, it } from 'vite-plus/test';
import { createComponentInstance } from '../../../src/runtime/component';
import {
  beginLifecycleCommitBatch,
  captureInlineRenderSnapshot,
  discardLifecycleCommitBatch,
} from '../../../src/runtime/lifecycle-batch';

describe('InlineRenderSnapshot rollback', () => {
  it('should restore ownership-identity fields mutated during a live re-render that throws', () => {
    const parentA = createComponentInstance('parentA', () => null, {}, null);
    const parentB = createComponentInstance('parentB', () => null, {}, null);
    const instance = createComponentInstance(
      'child',
      () => null,
      { greeting: 'hi' },
      parentA
    );

    // Establish the "before" state, as it would look after a prior
    // successful render of this live instance.
    const ownerVNodeA = { type: 'child-owner-a' };
    instance._vnodeOwner = ownerVNodeA;
    instance._vnodeParent = parentA;
    instance._vnodeKey = 'stable-key';
    instance._vnodePosition = 0;
    instance._wrapperDepth = 0;
    instance.cleanupStrict = false;

    const batch = beginLifecycleCommitBatch();
    captureInlineRenderSnapshot(instance);

    // Simulate what component-host.ts's live-instance branch of
    // syncComponentElement does before calling the (throwable)
    // renderComponentInline: re-derive ownership identity for a NEW vnode
    // occurrence, as if this instance were being reused under a different
    // parent/position/wrapper depth.
    const ownerVNodeB = { type: 'child-owner-b' };
    instance._vnodeOwner = ownerVNodeB;
    instance._vnodeParent = parentB;
    delete instance._vnodeKey;
    instance._vnodePosition = 3;
    instance._wrapperDepth = 2;
    instance.cleanupStrict = true;

    // The render throws - discard the batch instead of flushing it.
    discardLifecycleCommitBatch(batch);

    expect(instance._vnodeOwner).toBe(ownerVNodeA);
    expect(instance._vnodeParent).toBe(parentA);
    expect(instance._vnodeKey).toBe('stable-key');
    expect(instance._vnodePosition).toBe(0);
    expect(instance._wrapperDepth).toBe(0);
    expect(instance.cleanupStrict).toBe(false);
  });
});
