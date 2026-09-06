import { describe, expect, it } from 'vite-plus/test';
import {
  CommitCoordinator,
  CommitTransaction,
} from '../../../src/runtime/transactions/coordinator';

describe('transaction encapsulation', () => {
  it('should reject forged and foreign handles before changing the active frame', () => {
    const coordinator = new CommitCoordinator();
    const other = new CommitCoordinator();
    const transaction = coordinator.begin();
    const foreign = other.begin();
    expect(() =>
      coordinator.commit(Object.create(CommitTransaction.prototype))
    ).toThrow();
    expect(() => coordinator.commit(foreign)).toThrow('another runtime');
    expect(coordinator.current).toBe(transaction);
    expect(other.current).toBe(foreign);
    expect(foreign.phase).toBe('preparing');
    coordinator.discard(transaction);
    other.discard(foreign);
  });
  it('should keep diagnostic indexes detached from live participant lookup', () => {
    const coordinator = new CommitCoordinator();
    const transaction = coordinator.begin();
    const key = {};
    const participant = { key };
    coordinator.register(participant);
    const index = transaction.inspect().index;
    Map.prototype.clear.call(index.get(undefined));
    Map.prototype.clear.call(index);
    expect(transaction.participant(key)).toBe(participant);
    coordinator.discard(transaction);
  });

  it('should retain the first reentrant resource and reject admission after settlement', () => {
    const coordinator = new CommitCoordinator();
    const transaction = coordinator.begin();
    const key = {};
    expect(
      transaction.captureResource(key, () => {
        transaction.captureResource(key, () => undefined);
        return 'later';
      })
    ).toBeUndefined();
    expect(transaction.hasResource(key)).toBe(true);
    coordinator.commit(transaction);
    expect(() => transaction.captureResource(key, () => 'closed')).toThrow(
      'settled'
    );
    expect(() => transaction.setDeferredNotifications(true)).toThrow('settled');
    expect(transaction.resourceCount).toBe(0);
  });

  it('should reject external phase changes without losing committed work', () => {
    const coordinator = new CommitCoordinator();
    const transaction = coordinator.begin();
    const events: string[] = [];
    coordinator.register({ settle: () => events.push('settled') });
    expect(() => Object.assign(transaction, { phase: 'committed' })).toThrow();
    coordinator.commit(transaction);
    expect(events).toEqual(['settled']);
  });

  it('should prevent inspection from deleting registered participants', () => {
    const coordinator = new CommitCoordinator();
    const transaction = coordinator.begin();
    const events: string[] = [];
    coordinator.register({ rollback: () => events.push('restored') });
    expect(() =>
      Object.assign(transaction.participants, { length: 0 })
    ).toThrow();
    coordinator.discard(transaction);
    expect(events).toEqual(['restored']);
  });
});
