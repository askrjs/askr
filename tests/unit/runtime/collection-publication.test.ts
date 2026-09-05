import { describe, expect, it } from 'vite-plus/test';
import { createChildScope } from '../../../src/runtime/child-scope';
import {
  createForState,
  beginForStateTransaction,
  rollbackForStateTransaction,
} from '../../../src/runtime/for-internal';
import { ownCleanup } from '../../../src/runtime/ownership';
import {
  beginCommitTransaction,
  commitTransaction,
  registerCommitParticipant,
  discardTransaction,
} from '../../../src/runtime/transaction-access';

describe('collection publication', () => {
  it('should publish membership before cleanup starts a replacement update', () => {
    const collection = createForState<number>(
      [],
      (item) => item,
      () => null,
      null
    );
    const removed = createChildScope(null, 'removed');
    const commit = beginCommitTransaction();
    beginForStateTransaction(collection);
    const previous = collection._transaction!;
    previous.removedScopes = [removed];
    collection.currentItems = [2];
    ownCleanup(removed.componentInstance.ownership, () => {
      expect(collection._transaction).toBeNull();
      expect(collection._committedItems).toEqual([2]);
      beginForStateTransaction(collection);
      expect(collection._transaction).not.toBe(previous);
    });
    commitTransaction(commit);
    expect(collection._transaction).not.toBeNull();
    expect(collection._transaction).not.toBe(previous);
    rollbackForStateTransaction(collection);
  });

  it('should restore published membership without retiring committed scopes after a later failure', () => {
    const collection = createForState<number>(
      [],
      (item) => item,
      () => null,
      null
    );
    const removed = createChildScope(null, 'retained');
    const commit = beginCommitTransaction();
    beginForStateTransaction(collection);
    collection._transaction!.fallbackScope = removed;
    collection._transaction!.removedScopes = [removed];
    collection.currentItems = [2];
    registerCommitParticipant({
      publish: () => {
        throw new Error('publication failed');
      },
    });
    try {
      expect(() => commitTransaction(commit)).toThrow('publication failed');
      expect(collection._committedItems).toEqual([]);
      expect(collection._transaction).toBeNull();
      expect(removed.componentInstance.ownership.disposed).toBe(false);
    } finally {
      discardTransaction(commit);
      removed.dispose();
    }
  });
});
