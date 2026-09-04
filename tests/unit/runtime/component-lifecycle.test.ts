import { describe, expect, it, vi } from 'vite-plus/test';
import { logger } from '../../../src/common/logger';
import { createComponentInstance } from '../../../src/runtime/component';
import {
  beginLifecycleCommitBatch,
  commitLifecycleForInstance,
  discardLifecycleCommitBatch,
  flushLifecycleCommitBatch,
  registerCommitOperationForInstance,
  registerLifecycleRollback,
  registerLifecycleTransaction,
  registerMountOperationForInstance,
} from '../../../src/runtime/component-lifecycle';

describe('committed lifecycle operation isolation', () => {
  it('should leave lifecycle containers unallocated until used', () => {
    const instance = createComponentInstance('lazy', () => null, {}, null);

    expect(instance.mountOperations).toBeUndefined();
    expect(instance.commitOperations).toBeUndefined();
    expect(instance.ownership.cleanups).toBeUndefined();
    expect(instance.lifecycleSlots).toBeUndefined();
  });

  it('should settle later mount and commit operations after earlier failures', () => {
    const instance = createComponentInstance(
      'lifecycle-isolation',
      () => null,
      {},
      null
    );
    const calls: string[] = [];
    const mountCleanup = vi.fn();
    const commitCleanup = vi.fn();
    const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});

    registerMountOperationForInstance(instance, () => {
      calls.push('mount-failed');
      throw new Error('mount failed');
    });
    registerMountOperationForInstance(instance, () => {
      calls.push('mount-settled');
      return mountCleanup;
    });
    registerCommitOperationForInstance(instance, () => {
      calls.push('commit-failed');
      throw new Error('commit failed');
    });
    registerCommitOperationForInstance(instance, () => {
      calls.push('commit-settled');
      return commitCleanup;
    });

    const batch = beginLifecycleCommitBatch();
    commitLifecycleForInstance(instance, true);

    expect(() => flushLifecycleCommitBatch(batch)).not.toThrow();
    expect(calls).toEqual([
      'mount-failed',
      'mount-settled',
      'commit-failed',
      'commit-settled',
    ]);
    expect(instance.mountOperations).toBeUndefined();
    expect(instance.commitOperations).toBeUndefined();
    expect(instance.ownership.cleanups).toEqual([mountCleanup, commitCleanup]);
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy.mock.calls[0]?.[1]).toBeInstanceOf(AggregateError);

    errorSpy.mockRestore();
  });

  it('should skip rollback-only entries while preserving full commit order', () => {
    const calls: string[] = [];
    const batch = beginLifecycleCommitBatch();

    registerLifecycleTransaction(
      {},
      () => calls.push('commit:first'),
      () => calls.push('rollback:first')
    );
    registerLifecycleRollback(() => calls.push('rollback:only'));
    registerLifecycleTransaction(
      {},
      () => calls.push('commit:last'),
      () => calls.push('rollback:last')
    );

    flushLifecycleCommitBatch(batch);

    expect(calls).toEqual(['commit:first', 'commit:last']);
  });

  it('should merge nested rollback-only entries in global registration order', () => {
    const calls: string[] = [];
    const parent = beginLifecycleCommitBatch();

    registerLifecycleTransaction(
      {},
      () => calls.push('commit:parent'),
      () => calls.push('rollback:parent')
    );
    registerLifecycleRollback(() => calls.push('rollback:parent-only'));

    const child = beginLifecycleCommitBatch();
    registerLifecycleRollback(() => calls.push('rollback:child-first'));
    registerLifecycleTransaction(
      {},
      () => calls.push('commit:child'),
      () => calls.push('rollback:child-transaction')
    );
    registerLifecycleRollback(() => calls.push('rollback:child-last'));
    flushLifecycleCommitBatch(child);

    registerLifecycleRollback(() => calls.push('rollback:parent-last'));
    discardLifecycleCommitBatch(parent);

    expect(calls).toEqual([
      'rollback:parent-last',
      'rollback:child-last',
      'rollback:child-transaction',
      'rollback:child-first',
      'rollback:parent-only',
      'rollback:parent',
    ]);
  });

  it('should isolate a discarded child batch from a surviving sibling', () => {
    const calls: string[] = [];
    const parent = beginLifecycleCommitBatch();

    const survivingChild = beginLifecycleCommitBatch();
    registerLifecycleTransaction(
      {},
      () => calls.push('commit:survivor'),
      () => calls.push('rollback:survivor')
    );
    flushLifecycleCommitBatch(survivingChild);

    const failingChild = beginLifecycleCommitBatch();
    registerLifecycleTransaction(
      {},
      () => calls.push('commit:failed'),
      () => calls.push('rollback:failed')
    );
    discardLifecycleCommitBatch(failingChild);

    expect(calls).toEqual(['rollback:failed']);

    flushLifecycleCommitBatch(parent);

    expect(calls).toEqual(['rollback:failed', 'commit:survivor']);
  });
});
