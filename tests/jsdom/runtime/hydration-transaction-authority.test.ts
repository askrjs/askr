import { describe, expect, it, vi } from 'vite-plus/test';
import {
  beginHydrationListenerTransaction,
  commitHydrationListenerTransaction,
  discardHydrationListenerTransaction,
  getCurrentHydrationListenerTransaction,
  hasStagedHydrationListener,
  stageHydrationListener,
} from '../../../src/renderer/hydration/listener-transaction';
import {
  beginCommitTransaction,
  commitTransaction,
  discardTransaction,
} from '../../../src/runtime/transactions/access';

describe('hydration listener transaction authority', () => {
  it('should discard an open listener child whose immediate parent has already joined', () => {
    const outer = beginCommitTransaction();
    const middle = beginCommitTransaction();
    const child = beginHydrationListenerTransaction();
    const publish = vi.fn();
    const rollback = vi.fn();
    stageHydrationListener({
      kind: 'direct',
      target: document.createElement('button'),
      eventName: 'click',
      capture: false,
      publish,
      rollback,
    });
    try {
      commitTransaction(middle);
      expect(child.active).toBe(false);
      commitHydrationListenerTransaction(child);
      expect(publish).not.toHaveBeenCalled();
      expect(rollback).toHaveBeenCalledOnce();
      expect(child.commit.phase).toBe('discarded');
    } finally {
      discardHydrationListenerTransaction(child);
      discardTransaction(outer);
    }
  });

  it('should recover a fresh listener transaction after pruning an abandoned child', () => {
    const outer = beginCommitTransaction();
    const child = beginHydrationListenerTransaction();
    const rollback = vi.fn();
    stageHydrationListener({
      kind: 'direct',
      target: document.createElement('button'),
      eventName: 'click',
      capture: false,
      publish() {},
      rollback,
    });
    discardTransaction(outer);
    const fresh = beginHydrationListenerTransaction();
    try {
      expect(child.commit.phase).toBe('discarded');
      expect(rollback).toHaveBeenCalledOnce();
      expect(fresh.active).toBe(true);
      expect(fresh.commit.parent).toBeNull();
      commitHydrationListenerTransaction(fresh);
      expect(fresh.commit.phase).toBe('committed');
    } finally {
      discardHydrationListenerTransaction(fresh);
      discardHydrationListenerTransaction(child);
    }
  });

  it('should drain failed listener rollback in reverse order and restore the live parent', () => {
    const parent = beginHydrationListenerTransaction();
    const child = beginHydrationListenerTransaction();
    const calls: number[] = [];
    for (const index of [1, 2, 3])
      stageHydrationListener({
        kind: 'direct',
        target: document.createElement('button'),
        eventName: 'click',
        capture: false,
        publish() {},
        rollback() {
          calls.push(index);
          if (index === 2) throw new Error('rollback failed');
        },
      });
    try {
      discardTransaction(child.commit);
      expect(calls).toEqual([3, 2, 1]);
      expect(child.stages).toHaveLength(0);
      expect(getCurrentHydrationListenerTransaction()).toBe(parent);
    } finally {
      discardHydrationListenerTransaction(child);
      discardHydrationListenerTransaction(parent);
    }
  });

  it.each(['commit', 'discard'] as const)(
    'should reject listener staging after the coordinator directly performs %s',
    (operation) => {
      const transaction = beginHydrationListenerTransaction();
      const target = document.createElement('button');
      const stage = {
        kind: 'direct' as const,
        target,
        eventName: 'click',
        capture: false,
        publish: vi.fn(),
        rollback: vi.fn(),
      };
      try {
        stageHydrationListener(stage);
        if (operation === 'commit') commitTransaction(transaction.commit);
        else discardTransaction(transaction.commit);
        expect(transaction.active).toBe(false);
        expect(stageHydrationListener(stage)).toBe(false);
        expect(hasStagedHydrationListener(target, 'click', false)).toBe(false);
        expect(getCurrentHydrationListenerTransaction()).toBeNull();
      } finally {
        discardHydrationListenerTransaction(transaction);
      }
    }
  );

  it('should resume the live listener parent after direct child rollback', () => {
    const parent = beginHydrationListenerTransaction();
    const child = beginHydrationListenerTransaction();
    try {
      discardTransaction(child.commit);
      expect(getCurrentHydrationListenerTransaction()).toBe(parent);
    } finally {
      discardHydrationListenerTransaction(child);
      discardHydrationListenerTransaction(parent);
    }
  });

  it('should not publish an open listener child after enclosing rollback', () => {
    const outer = beginCommitTransaction();
    const child = beginHydrationListenerTransaction();
    const publish = vi.fn();
    const rollback = vi.fn();
    try {
      stageHydrationListener({
        kind: 'direct',
        target: document.createElement('button'),
        eventName: 'click',
        capture: false,
        publish,
        rollback,
      });
      discardTransaction(outer);
      expect(child.active).toBe(false);
      commitHydrationListenerTransaction(child);
      expect(publish).not.toHaveBeenCalled();
      expect(rollback).toHaveBeenCalledOnce();
    } finally {
      discardHydrationListenerTransaction(child);
      discardTransaction(outer);
    }
  });
});
