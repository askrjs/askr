import { describe, expect, it, vi } from 'vite-plus/test';
import { logger } from '../../../src/common/logger';
import { createComponentInstance } from '../../../src/runtime/component';
import { cleanupComponent } from '../../../src/runtime/component-cleanup';
import { restartComponentGeneration } from '../../../src/runtime/component-generation';
import {
  beginCommitTransaction,
  commitLifecycleForInstance,
  discardTransaction,
  commitTransaction,
  registerCommitOperationForInstance,
  registerCommitRollback,
  registerCommitEffect,
  registerMountOperationForInstance,
} from '../../../src/runtime/component-lifecycle';

describe('committed lifecycle operation isolation', () => {
  it('should leave replacement lifetime work untouched by an obsolete transaction', () => {
    const instance = createComponentInstance(
      'replacement',
      () => null,
      {},
      null
    );
    const oldMount = vi.fn();
    const nextMount = vi.fn();
    const transaction = beginCommitTransaction();
    registerMountOperationForInstance(instance, oldMount);
    commitLifecycleForInstance(instance, true);
    cleanupComponent(instance);
    restartComponentGeneration(instance, () => null, false);
    registerMountOperationForInstance(instance, nextMount);
    commitTransaction(transaction);
    expect(oldMount).not.toHaveBeenCalled();
    expect(nextMount).not.toHaveBeenCalled();
    expect(instance.mountOperations).toEqual([nextMount]);
    const next = beginCommitTransaction();
    commitLifecycleForInstance(instance, true);
    commitTransaction(next);
    expect(nextMount).toHaveBeenCalledTimes(1);
  });

  it('should capture commit operations before mount work replaces the lifetime', () => {
    const instance = createComponentInstance('reentrant', () => null, {}, null);
    const oldCommit = vi.fn();
    const nextCommit = vi.fn();
    const transaction = beginCommitTransaction();
    registerMountOperationForInstance(instance, () => {
      cleanupComponent(instance);
      restartComponentGeneration(instance, () => null, false);
      registerCommitOperationForInstance(instance, nextCommit);
    });
    registerCommitOperationForInstance(instance, oldCommit);
    commitLifecycleForInstance(instance, true);
    commitTransaction(transaction);
    expect(oldCommit).toHaveBeenCalledTimes(1);
    expect(nextCommit).not.toHaveBeenCalled();
    expect(instance.commitOperations).toEqual([nextCommit]);
    cleanupComponent(instance);
  });

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

    const batch = beginCommitTransaction();
    commitLifecycleForInstance(instance, true);

    expect(() => commitTransaction(batch)).not.toThrow();
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
    const batch = beginCommitTransaction();

    registerCommitEffect(
      {},
      () => calls.push('commit:first'),
      () => calls.push('rollback:first')
    );
    registerCommitRollback(() => calls.push('rollback:only'));
    registerCommitEffect(
      {},
      () => calls.push('commit:last'),
      () => calls.push('rollback:last')
    );

    commitTransaction(batch);

    expect(calls).toEqual(['commit:first', 'commit:last']);
  });

  it('should merge nested rollback-only entries in global registration order', () => {
    const calls: string[] = [];
    const parent = beginCommitTransaction();

    registerCommitEffect(
      {},
      () => calls.push('commit:parent'),
      () => calls.push('rollback:parent')
    );
    registerCommitRollback(() => calls.push('rollback:parent-only'));

    const child = beginCommitTransaction();
    registerCommitRollback(() => calls.push('rollback:child-first'));
    registerCommitEffect(
      {},
      () => calls.push('commit:child'),
      () => calls.push('rollback:child-transaction')
    );
    registerCommitRollback(() => calls.push('rollback:child-last'));
    commitTransaction(child);

    registerCommitRollback(() => calls.push('rollback:parent-last'));
    discardTransaction(parent);

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
    const parent = beginCommitTransaction();

    const survivingChild = beginCommitTransaction();
    registerCommitEffect(
      {},
      () => calls.push('commit:survivor'),
      () => calls.push('rollback:survivor')
    );
    commitTransaction(survivingChild);

    const failingChild = beginCommitTransaction();
    registerCommitEffect(
      {},
      () => calls.push('commit:failed'),
      () => calls.push('rollback:failed')
    );
    discardTransaction(failingChild);

    expect(calls).toEqual(['rollback:failed']);

    commitTransaction(parent);

    expect(calls).toEqual(['rollback:failed', 'commit:survivor']);
  });
});
