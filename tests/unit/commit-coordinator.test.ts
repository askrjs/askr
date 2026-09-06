import { expect, test } from 'vite-plus/test';
import { CommitCoordinator } from '../../src/runtime/transactions/coordinator';

test.each([
  { parentCount: 0, childCount: 5 },
  { parentCount: 1, childCount: 5 },
  { parentCount: 5, childCount: 1 },
])(
  'should retain resource values and rollback order with $parentCount parent and $childCount child resources',
  ({ parentCount, childCount }) => {
    const coordinator = new CommitCoordinator();
    const events: string[] = [];
    const rollbackValues: unknown[] = [];
    const parent = coordinator.begin();
    const parentEntries = Array.from(
      { length: parentCount },
      () => [{}, {}] as const
    );
    for (const [key, value] of parentEntries)
      parent.captureResource(key, () => value);
    const sharedKey = {};
    if (parentCount > 0) parent.captureResource(sharedKey, () => undefined);
    coordinator.register({ rollback: () => events.push('parent') });
    const child = coordinator.begin();
    const childEntries = Array.from(
      { length: childCount },
      () => [{}, {}] as const
    );
    for (const [key, value] of childEntries)
      child.captureResource(key, () => value);
    child.captureResource(sharedKey, () => 'child');
    coordinator.register({
      rollback: () => {
        events.push('child');
        // Restoration consumes the still-live resource values before release.
        for (const [key] of [...parentEntries, ...childEntries])
          rollbackValues.push(parent.resource(key));
      },
    });
    coordinator.commit(child);
    expect(child.resourceCount).toBe(0);
    for (const [key, value] of [...parentEntries, ...childEntries])
      expect(parent.resource(key)).toBe(value);
    expect(parent.hasResource(sharedKey)).toBe(true);
    expect(parent.resource(sharedKey)).toBe(
      parentCount > 0 ? undefined : 'child'
    );
    const sibling = coordinator.begin();
    sibling.captureResource(sharedKey, () => 'sibling');
    coordinator.commit(sibling);
    expect(sibling.resourceCount).toBe(0);
    expect(parent.resource(sharedKey)).toBe(
      parentCount > 0 ? undefined : 'child'
    );
    coordinator.discard(parent);
    expect(events).toEqual(['child', 'parent']);
    for (const [index, [, value]] of [
      ...parentEntries,
      ...childEntries,
    ].entries())
      expect(rollbackValues[index]).toBe(value);
    expect(parent.resourceCount).toBe(0);
  }
);

test('should preserve keyed lookup and rollback order across released child and sibling joins', () => {
  const coordinator = new CommitCoordinator();
  const parent = coordinator.begin();
  const rollbacks: string[] = [];
  const existingKind = {};
  const childKind = {};
  const siblingKind = {};
  const key = {};
  const original = {
    key,
    kind: existingKind,
    rollback: () => rollbacks.push('original'),
  };
  coordinator.register(original);

  const child = coordinator.begin();
  const childMember = {
    key,
    kind: childKind,
    rollback: () => rollbacks.push('child'),
  };
  const defaultMember = { key, rollback: () => rollbacks.push('default') };
  coordinator.register(childMember);
  coordinator.register(defaultMember);
  coordinator.commit(child);
  expect(child.inspect().index.size).toBe(0);
  expect(parent.participant(key, existingKind)).toBe(original);
  expect(parent.participant(key, childKind)).toBe(childMember);
  expect(parent.participant(key)).toBe(defaultMember);

  const sibling = coordinator.begin();
  const nextKey = {};
  const addedExisting = {
    key: nextKey,
    kind: existingKind,
    rollback: () => rollbacks.push('added existing'),
  };
  const addedChildKind = {
    key: nextKey,
    kind: childKind,
    rollback: () => rollbacks.push('added child kind'),
  };
  const addedSiblingKind = {
    key,
    kind: siblingKind,
    rollback: () => rollbacks.push('added sibling kind'),
  };
  coordinator.register(childMember);
  coordinator.register(addedExisting);
  coordinator.register(addedChildKind);
  coordinator.register(addedSiblingKind);
  coordinator.commit(sibling);
  expect(sibling.inspect().index.size).toBe(0);
  expect(parent.participant(key, existingKind)).toBe(original);
  expect(parent.participant(key, childKind)).toBe(childMember);
  expect(parent.participant(key)).toBe(defaultMember);
  expect(parent.participant(nextKey, existingKind)).toBe(addedExisting);
  expect(parent.participant(nextKey, childKind)).toBe(addedChildKind);
  expect(parent.participant(key, siblingKind)).toBe(addedSiblingKind);
  coordinator.register(childMember);
  coordinator.register(addedSiblingKind);
  expect(parent.participants).toEqual([
    original,
    childMember,
    defaultMember,
    addedExisting,
    addedChildKind,
    addedSiblingKind,
  ]);
  coordinator.discard(parent);
  expect(rollbacks).toEqual([
    'added sibling kind',
    'added child kind',
    'added existing',
    'default',
    'child',
    'original',
  ]);
});

test.each([
  { parentCount: 1, childCount: 5 },
  { parentCount: 5, childCount: 1 },
])(
  'should preserve collision owners with $parentCount parent and $childCount child keyed members',
  ({ parentCount, childCount }) => {
    const coordinator = new CommitCoordinator();
    const events: string[] = [];
    const kind = {};
    const parent = coordinator.begin();
    const parentMembers = Array.from({ length: parentCount }, (_, index) => ({
      key: {},
      kind,
      settle: () => events.push(`parent ${index}`),
    }));
    for (const member of parentMembers) coordinator.register(member);
    const child = coordinator.begin();
    const collision = {
      key: parentMembers[0].key,
      kind,
      collision: 'keep-first' as const,
      settle: () => events.push('discarded collision'),
    };
    coordinator.register(collision);
    const childMembers = Array.from({ length: childCount }, (_, index) => ({
      key: {},
      kind,
      settle: () => events.push(`child ${index}`),
    }));
    for (const member of childMembers) coordinator.register(member);
    coordinator.commit(child);
    expect(child.inspect().index.size).toBe(0);
    for (const member of [...parentMembers, ...childMembers])
      expect(parent.participant(member.key, kind)).toBe(member);
    coordinator.register(collision);
    expect(parent.participants).toEqual([...parentMembers, ...childMembers]);
    coordinator.commit(parent);
    expect(events).toEqual([
      ...parentMembers.map((_, index) => `parent ${index}`),
      ...childMembers.map((_, index) => `child ${index}`),
    ]);
  }
);

test.each([false, true])(
  'should retain an originally unkeyed identity when assigned a key with shared parent %s',
  (sharedParent) => {
    const coordinator = new CommitCoordinator();
    const events: string[] = [];
    const participant = {
      key: undefined as object | undefined,
      settle: () => events.push('settled'),
    };
    const parent = coordinator.begin();
    if (sharedParent) coordinator.register(participant);
    const child = coordinator.begin();
    coordinator.register(participant);
    participant.key = {};
    coordinator.commit(child);
    expect(parent.participants).toEqual([participant]);
    expect(parent.participant(participant.key)).toBe(
      sharedParent ? undefined : participant
    );
    coordinator.register(participant);
    coordinator.commit(parent);
    expect(events).toEqual(['settled']);
  }
);

test.each([false, true])(
  'should transfer the current kind after changing from a named kind %s',
  (initiallyNamed) => {
    const coordinator = new CommitCoordinator();
    const parent = coordinator.begin();
    const child = coordinator.begin();
    const namedKind = {};
    const originalKind = initiallyNamed ? namedKind : undefined;
    const nextKind = initiallyNamed ? undefined : namedKind;
    const participant = { key: {}, kind: originalKind };
    coordinator.register(participant);
    participant.kind = nextKind;
    coordinator.commit(child);
    expect(parent.participant(participant.key, originalKind)).toBeUndefined();
    expect(parent.participant(participant.key, nextKind)).toBe(participant);
    coordinator.register(participant);
    expect(parent.participants).toEqual([participant]);
    coordinator.discard(parent);
  }
);

test.each([
  { policy: 'keep-first', collision: 'keep-first' as const, merges: 0 },
  { policy: 'merge', collision: undefined, merges: 1 },
])(
  'should keep a $policy identity out of a newly joined kind index',
  ({ collision, merges }) => {
    const coordinator = new CommitCoordinator();
    const parent = coordinator.begin();
    const key = {};
    const original = { key };
    coordinator.register(original);
    let mergeCalls = 0;
    const coalesced = {
      key,
      kind: undefined as object | undefined,
      collision,
      merge: () => mergeCalls++,
    };
    coordinator.register(coalesced);
    const child = coordinator.begin();
    const childKind = {};
    coalesced.kind = childKind;
    const admitted = { key: {}, kind: childKind };
    coordinator.register(coalesced);
    coordinator.register(admitted);
    coordinator.commit(child);
    expect(child.inspect().index.size).toBe(0);
    expect(parent.participant(key)).toBe(original);
    expect(parent.participant(key, childKind)).toBeUndefined();
    expect(parent.participant(admitted.key, childKind)).toBe(admitted);
    coordinator.register(coalesced);
    const sibling = coordinator.begin();
    coordinator.register(coalesced);
    coordinator.commit(sibling);
    coordinator.register(coalesced);
    expect(parent.participant(key, childKind)).toBeUndefined();
    expect(parent.participants).toEqual([original, admitted]);
    expect(mergeCalls).toBe(merges);
    coordinator.discard(parent);
  }
);

test('should transfer a re-registered participant once after its key is cleared', () => {
  const coordinator = new CommitCoordinator();
  const events: string[] = [];
  const parent = coordinator.begin();
  const child = coordinator.begin();
  const participant = {
    key: {} as object | undefined,
    settle: () => events.push('settled'),
  };
  coordinator.register(participant);
  participant.key = undefined;
  coordinator.register(participant);
  coordinator.commit(child);
  expect(parent.participants).toEqual([participant]);
  coordinator.commit(parent);
  expect(events).toEqual(['settled']);
});

test('should merge and transfer work appended by a nested merge callback', () => {
  const coordinator = new CommitCoordinator();
  const events: string[] = [];
  const parent = coordinator.begin();
  const first = {};
  const second = {};
  coordinator.register({ key: first });
  coordinator.register({ key: second });
  const child = coordinator.begin();
  coordinator.register({
    key: first,
    merge: () => {
      events.push('first merge');
      coordinator.register({
        key: second,
        merge: () => events.push('appended merge'),
      });
      coordinator.register({ settle: () => events.push('appended settle') });
    },
  });
  coordinator.commit(child);
  expect(events).toEqual(['first merge', 'appended merge']);
  coordinator.commit(parent);
  expect(events).toEqual(['first merge', 'appended merge', 'appended settle']);
});

test.each([
  { parentCount: 1, childCount: 5 },
  { parentCount: 5, childCount: 1 },
])(
  'should preserve joined identities with $parentCount parent and $childCount child members',
  ({ parentCount, childCount }) => {
    const coordinator = new CommitCoordinator();
    const events: string[] = [];
    const merges: string[] = [];
    const parent = coordinator.begin();
    const parentMembers = Array.from({ length: parentCount }, (_, index) => ({
      settle: () => events.push(`parent ${index}`),
    }));
    for (const member of parentMembers) coordinator.register(member);
    const shared = { settle: () => events.push('shared') };
    coordinator.register(shared);
    const parentKey = {};
    coordinator.register({
      key: parentKey,
      settle: () => events.push('parent keyed'),
    });
    const parentMerged = {
      key: parentKey,
      merge: () => merges.push('parent'),
    };
    const parentDiscarded = {
      key: parentKey,
      collision: 'keep-first' as const,
    };
    coordinator.register(parentMerged);
    coordinator.register(parentDiscarded);

    const child = coordinator.begin();
    const childMembers = Array.from({ length: childCount }, (_, index) => ({
      settle: () => events.push(`child ${index}`),
    }));
    for (const member of childMembers) coordinator.register(member);
    coordinator.register(shared);
    const childKey = {};
    coordinator.register({
      key: childKey,
      settle: () => events.push('child keyed'),
    });
    const childMerged = {
      key: childKey,
      merge: () => merges.push('child'),
    };
    const childDiscarded = {
      key: childKey,
      collision: 'keep-first' as const,
    };
    const discardedOnJoin = {
      key: parentKey,
      collision: 'keep-first' as const,
    };
    coordinator.register(childMerged);
    coordinator.register(childDiscarded);
    coordinator.register(discardedOnJoin);
    coordinator.commit(child);
    const joinedMembers = parent.participants.slice();
    const coalesced = [
      parentMerged,
      parentDiscarded,
      childMerged,
      childDiscarded,
      discardedOnJoin,
    ];
    for (const member of [
      shared,
      ...parentMembers,
      ...childMembers,
      ...coalesced,
    ])
      coordinator.register(member);
    expect(parent.participants).toEqual(joinedMembers);

    const sibling = coordinator.begin();
    coordinator.register(shared);
    for (const member of coalesced) coordinator.register(member);
    const siblingMember = { settle: () => events.push('sibling') };
    coordinator.register(siblingMember);
    coordinator.commit(sibling);
    coordinator.register(siblingMember);
    for (const member of coalesced) coordinator.register(member);
    expect(parent.participants).toEqual([...joinedMembers, siblingMember]);
    expect(merges).toEqual(['parent', 'child']);
    coordinator.commit(parent);
    expect(events).toEqual([
      ...parentMembers.map((_, index) => `parent ${index}`),
      'shared',
      'parent keyed',
      ...childMembers.map((_, index) => `child ${index}`),
      'child keyed',
      'sibling',
    ]);
  }
);

test('should leave both frames intact when the final nested collision is invalid', () => {
  const coordinator = new CommitCoordinator();
  const parent = coordinator.begin();
  parent.setDeferredNotifications(true);
  const key = {};
  const resource = {};
  const completion = {};
  coordinator.register({ key });
  coordinator.register({});
  parent.captureResource(resource, () => 'parent');
  coordinator.deferCompletion(completion, () => {});
  const child = coordinator.begin();
  coordinator.register({});
  coordinator.register({ key });
  child.captureResource(resource, () => 'child');
  child.captureResource({}, () => 'child only');
  coordinator.deferCompletion(completion, () => {});
  coordinator.deferCompletion({}, () => {});
  const snapshots = [parent, child].map((frame) => ({
    members: frame.participants.slice(),
    resources: [...frame.inspect().resources],
    completions: [...frame.inspect().completions!],
    seen: [...frame.inspect().seen!],
  }));
  expect(() => coordinator.commit(child)).toThrow('merge');
  for (const [index, frame] of [parent, child].entries()) {
    expect(frame.phase).toBe('preparing');
    expect(frame.participants).toEqual(snapshots[index].members);
    expect([...frame.inspect().resources]).toEqual(snapshots[index].resources);
    expect([...frame.inspect().completions!]).toEqual(
      snapshots[index].completions
    );
    expect([...frame.inspect().seen!]).toEqual(snapshots[index].seen);
  }
  coordinator.discard(child);
  coordinator.discard(parent);
});

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
  parent.setDeferredNotifications(true);
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
