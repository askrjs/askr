import { expect, test } from 'vite-plus/test';
import { CommitCoordinator } from '../../src/runtime/transaction-coordinator';

test('should roll back a participant shared by failed nested frames once', () => {
  const coordinator = new CommitCoordinator();
  const parent = coordinator.begin();
  let rollbacks = 0;
  const shared = {
    key: {},
    rollback: () => {
      rollbacks++;
    },
  };
  const collision = {};
  coordinator.register(shared);
  coordinator.register({ key: collision });
  const child = coordinator.begin();
  coordinator.register(shared);
  coordinator.register({
    key: collision,
    merge: () => {
      throw new Error('merge failed');
    },
  });
  expect(() => coordinator.commit(child)).toThrow('merge failed');
  expect(rollbacks).toBe(1);
  expect(parent.phase).toBe('discarded');
});

test('should rejects distinct duplicate participants without silently losing work', () => {
  const coordinator = new CommitCoordinator();
  const transaction = coordinator.begin();
  const key = {};
  const first = { key };
  coordinator.register(first);
  expect(() => coordinator.register(first)).not.toThrow();
  expect(() => coordinator.register({ key })).toThrow('merge');
  expect(transaction.participants).toEqual([first]);
  coordinator.discard(transaction);
});

test('should validates every nested collision before transferring any participant', () => {
  const coordinator = new CommitCoordinator();
  const parent = coordinator.begin();
  const key = {};
  const events: string[] = [];
  const original = { key, settle: () => events.push('parent') };
  coordinator.register(original);
  const child = coordinator.begin();
  coordinator.register({ rollback: () => events.push('rollback') });
  coordinator.register({ key, settle: () => events.push('child') });
  expect(() => coordinator.commit(child)).toThrow('merge');
  expect(parent.participants).toEqual([original]);
  coordinator.discard(child);
  coordinator.commit(parent);
  expect(events).toEqual(['rollback', 'parent']);
});

test('should merges nested keyed work and keeps different kinds independent', () => {
  const coordinator = new CommitCoordinator();
  const parent = coordinator.begin();
  const key = {};
  const values = [1];
  const events: number[] = [];
  coordinator.register({ key, settle: () => events.push(...values) });
  const child = coordinator.begin();
  coordinator.register({ key, merge: () => values.push(2) });
  coordinator.register({ key, kind: {}, settle: () => events.push(3) });
  coordinator.commit(child);
  coordinator.commit(parent);
  expect(events).toEqual([1, 2, 3]);
});

test('should honor incoming keep-first before merge in direct and nested collisions', () => {
  const coordinator = new CommitCoordinator();
  const parent = coordinator.begin();
  const key = {};
  const original = { key };
  coordinator.register(original);
  const incoming = {
    key,
    collision: 'keep-first' as const,
    merge: () => {
      throw new Error('must not merge');
    },
  };
  coordinator.register(incoming);
  const child = coordinator.begin();
  coordinator.register(incoming);
  coordinator.commit(child);
  expect(parent.participants).toEqual([original]);
  coordinator.commit(parent);
});

test('should discard both frames and drain rollback after a partially successful nested merge', () => {
  const events: string[] = [];
  const failure = new Error('merge failed');
  const coordinator = new CommitCoordinator();
  const parent = coordinator.begin();
  const first = {};
  const second = {};
  coordinator.register({
    key: first,
    rollback: () => {
      events.push('parent-first');
    },
  });
  coordinator.register({
    key: second,
    rollback: () => {
      events.push('parent-second');
      throw new Error('rollback failed');
    },
  });
  const child = coordinator.begin();
  coordinator.register({
    key: first,
    merge: () => {
      events.push('merge-first');
    },
    rollback: () => {
      events.push('child-first');
    },
  });
  coordinator.register({
    key: second,
    merge: () => {
      throw failure;
    },
    rollback: () => {
      events.push('child-second');
    },
  });
  expect(() => coordinator.commit(child)).toThrow(failure);
  expect(parent.phase).toBe('discarded');
  expect(child.phase).toBe('discarded');
  expect(events).toEqual([
    'merge-first',
    'child-second',
    'child-first',
    'parent-second',
    'parent-first',
  ]);
  coordinator.commit(parent);
  expect(coordinator.current).toBeNull();
});

test('should merge direct collisions and roll back incoming work when merge throws', () => {
  const coordinator = new CommitCoordinator();
  const transaction = coordinator.begin();
  const key = {};
  const events: string[] = [];
  coordinator.register({
    key,
    rollback: () => {
      events.push('original');
    },
  });
  coordinator.register({
    key,
    merge: () => {
      events.push('merged');
    },
  });
  expect(() =>
    coordinator.register({
      key,
      merge: () => {
        throw new Error('merge failed');
      },
      rollback: () => {
        events.push('incoming');
      },
    })
  ).toThrow('merge failed');
  expect(events).toEqual(['merged', 'incoming', 'original']);
  expect(transaction.phase).toBe('discarded');
});
