import { expect, test } from 'vite-plus/test';
import { CommitCoordinator } from '../../src/runtime/transaction-coordinator';

test('should invalidate shared ancestors before draining a direct child merge failure', () => {
  const failure = new Error('merge failed');
  const rollbackFailure = new Error('rollback failed');
  const rollbackErrors: unknown[] = [];
  const events: string[] = [];
  const coordinator = new CommitCoordinator({
    rollbackError: (error) => rollbackErrors.push(error),
  });
  const unrelated = coordinator.begin();
  coordinator.register({ settle: () => events.push('unrelated') });
  const outer = coordinator.begin();
  const shared = {
    key: {},
    value: 'original',
    settle: () => events.push(shared.value),
    rollback: () => {
      events.push('shared rollback');
      throw rollbackFailure;
    },
  };
  coordinator.register(shared);
  const parent = coordinator.begin();
  coordinator.register(shared);
  const child = coordinator.begin();
  coordinator.register(shared);
  expect(() =>
    coordinator.register({
      key: shared.key,
      merge: () => {
        shared.value = 'partial';
        throw failure;
      },
      rollback: () => {
        events.push('incoming rollback');
        // Rollback callbacks must not be able to publish an affected ancestor.
        coordinator.commit(parent);
        coordinator.commit(outer);
      },
    })
  ).toThrow(failure);
  expect([child.phase, parent.phase, outer.phase]).toEqual([
    'discarded',
    'discarded',
    'discarded',
  ]);
  expect(events).toEqual(['incoming rollback', 'shared rollback']);
  expect(rollbackErrors).toEqual([rollbackFailure]);
  coordinator.discard(child);
  coordinator.discard(parent);
  coordinator.discard(outer);
  expect(coordinator.current).toBe(unrelated);
  coordinator.commit(unrelated);
  expect(events).toEqual(['incoming rollback', 'shared rollback', 'unrelated']);
});

test('should preserve an unrelated parent after a direct child merge failure', () => {
  const coordinator = new CommitCoordinator();
  const events: string[] = [];
  const parent = coordinator.begin();
  coordinator.register({ settle: () => events.push('parent') });
  const child = coordinator.begin();
  const key = {};
  coordinator.register({ key, rollback: () => events.push('child') });
  expect(() =>
    coordinator.register({
      key,
      merge: () => {
        throw new Error('child merge');
      },
    })
  ).toThrow('child merge');
  expect(child.phase).toBe('discarded');
  expect(parent.phase).toBe('preparing');
  coordinator.commit(parent);
  expect(events).toEqual(['child', 'parent']);
});

test('should invalidate ancestors connected through another shared participant', () => {
  const coordinator = new CommitCoordinator();
  const events: string[] = [];
  const outer = coordinator.begin();
  const first = { key: {}, rollback: () => events.push('first') };
  const second = { key: {}, rollback: () => events.push('second') };
  coordinator.register(first);
  coordinator.register(second);
  const parent = coordinator.begin();
  coordinator.register(second);
  const child = coordinator.begin();
  coordinator.register(first);
  expect(() =>
    coordinator.register({
      key: first.key,
      merge: () => {
        throw new Error('merge failed');
      },
    })
  ).toThrow('merge failed');
  expect([child.phase, parent.phase, outer.phase]).toEqual([
    'discarded',
    'discarded',
    'discarded',
  ]);
  expect(events).toEqual(['second', 'first']);
  expect(coordinator.current).toBeNull();
});

test('should finish shared rollback before draining deferred completions', () => {
  const coordinator = new CommitCoordinator();
  const events: string[] = [];
  const parent = coordinator.begin();
  parent.deferNotifications = true;
  const shared = {
    key: {},
    rollback: () => events.push('shared rollback'),
  };
  coordinator.register(shared);
  const child = coordinator.begin();
  coordinator.register(shared);
  coordinator.deferCompletion({}, () => events.push('completion'));
  expect(() =>
    coordinator.register({
      key: shared.key,
      merge: () => {
        throw new Error('merge failed');
      },
      rollback: () => {
        events.push('incoming rollback');
        coordinator.deferCompletion({}, () =>
          events.push('rollback completion')
        );
      },
    })
  ).toThrow('merge failed');
  expect(events).toEqual([
    'incoming rollback',
    'shared rollback',
    'completion',
    'rollback completion',
  ]);
  expect(parent.phase).toBe('discarded');
  expect(child.phase).toBe('discarded');
  expect(coordinator.current).toBeNull();
});

test('should keep unkeyed and already-merged participant registration idempotent', () => {
  const coordinator = new CommitCoordinator();
  const parent = coordinator.begin();
  const unkeyed = {};
  coordinator.register(unkeyed);
  coordinator.register(unkeyed);
  expect(parent.participants).toEqual([unkeyed]);
  const key = {};
  let merges = 0;
  coordinator.register({ key });
  const incoming = {
    key,
    merge: () => {
      merges++;
    },
  };
  coordinator.register(incoming);
  coordinator.register(incoming);
  expect(merges).toBe(1);
  const child = coordinator.begin();
  coordinator.register(unkeyed);
  coordinator.register(incoming);
  coordinator.commit(child);
  expect(parent.participants).toHaveLength(2);
  expect(merges).toBe(1);
  coordinator.discard(parent);
});

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
