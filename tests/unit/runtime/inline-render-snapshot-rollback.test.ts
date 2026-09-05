import { describe, expect, it } from 'vite-plus/test';
import { createComponentInstance } from '../../../src/runtime';
import {
  beginCommitTransaction,
  captureInlineRenderSnapshot,
  discardTransaction,
} from '../../../src/runtime/render-transaction';

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

    const batch = beginCommitTransaction();
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
    discardTransaction(batch);

    expect(instance._vnodeOwner).toBe(ownerVNodeA);
    expect(instance._vnodeParent).toBe(parentA);
    expect(instance._vnodeKey).toBe('stable-key');
    expect(instance._vnodePosition).toBe(0);
    expect(instance._wrapperDepth).toBe(0);
    expect(instance.cleanupStrict).toBe(false);
  });

  it('should restore an absent key to absent, and a falsy-but-present key correctly', () => {
    const parent = createComponentInstance('parent', () => null, {}, null);

    // Case 1: key absent before the render, assigned during it - rollback
    // must delete it again, not leave it set to the mutated value.
    const noKeyInstance = createComponentInstance(
      'no-key-child',
      () => null,
      {},
      parent
    );
    delete noKeyInstance._vnodeKey;

    const batch1 = beginCommitTransaction();
    captureInlineRenderSnapshot(noKeyInstance);
    noKeyInstance._vnodeKey = 'assigned-during-render';
    discardTransaction(batch1);

    expect('_vnodeKey' in noKeyInstance).toBe(false);

    // Case 2: a falsy-but-present key (0) must round-trip as 0, not be
    // confused with "absent" by the hasVNodeKey/undefined distinction.
    const falsyKeyInstance = createComponentInstance(
      'falsy-key-child',
      () => null,
      {},
      parent
    );
    falsyKeyInstance._vnodeKey = 0;

    const batch2 = beginCommitTransaction();
    captureInlineRenderSnapshot(falsyKeyInstance);
    falsyKeyInstance._vnodeKey = 'reassigned';
    discardTransaction(batch2);

    expect('_vnodeKey' in falsyKeyInstance).toBe(true);
    expect(falsyKeyInstance._vnodeKey).toBe(0);
  });
});
