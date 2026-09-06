import { describe, expect, it } from 'vite-plus/test';
import { CommitCoordinator } from '../../../src/runtime/transactions/coordinator';

describe('shared commit coordination', () => {
  it('should discard a joining child when its merge discards the parent', () => {
    const coordinator = new CommitCoordinator();
    const parent = coordinator.begin();
    const key = {};
    const calls: string[] = [];
    coordinator.register({
      key,
      rollback() {
        calls.push('parent');
      },
    });
    const child = coordinator.begin();
    coordinator.register({
      key,
      merge() {
        coordinator.discard(parent);
      },
      rollback() {
        calls.push('child');
      },
    });
    coordinator.commit(child);
    expect(parent.phase).toBe('discarded');
    expect(child.phase).toBe('discarded');
    expect(calls).toEqual(['parent', 'child']);
    expect(coordinator.current).toBeNull();
  });

  it('should merge once when a merge callback commits its own child again', () => {
    const coordinator = new CommitCoordinator();
    const parent = coordinator.begin();
    const key = {};
    coordinator.register({ key });
    const child = coordinator.begin();
    let merges = 0;
    coordinator.register({
      key,
      merge() {
        if (++merges === 1) coordinator.commit(child);
      },
    });
    coordinator.commit(child);
    expect(merges).toBe(1);
    expect(child.phase).toBe('joined');
    coordinator.commit(parent);
    expect(parent.phase).toBe('committed');
    expect(coordinator.current).toBeNull();
  });

  it('should preserve a discarded child during participant merge', () => {
    const coordinator = new CommitCoordinator();
    const calls: string[] = [];
    const parent = coordinator.begin();
    const key = {};
    coordinator.register({
      key,
      settle() {
        calls.push('parent');
      },
    });
    const child = coordinator.begin();
    coordinator.register({
      key,
      merge() {
        coordinator.discard(child);
      },
      rollback() {
        calls.push('rollback');
      },
    });
    coordinator.commit(child);
    expect(child.phase).toBe('discarded');
    expect(coordinator.current).toBe(parent);
    coordinator.commit(parent);
    expect(calls).toEqual(['rollback', 'parent']);
  });

  it.each(['apply', 'publish'] as const)(
    'should keep discard terminal during %s',
    (phase) => {
      const coordinator = new CommitCoordinator();
      const transaction = coordinator.begin();
      const calls: string[] = [];
      coordinator.register({
        [phase]() {
          calls.push(phase);
          coordinator.discard(transaction);
        },
        rollback() {
          calls.push('rollback');
        },
        settle() {
          calls.push('settle');
        },
      });
      coordinator.commit(transaction);
      expect(transaction.phase).toBe('discarded');
      expect(calls).toEqual([phase, 'rollback']);
      expect(coordinator.current).toBeNull();
    }
  );

  it.each(['apply', 'publish'] as const)(
    'should ignore recursive commit during %s without duplicating work',
    (phase) => {
      const coordinator = new CommitCoordinator();
      const transaction = coordinator.begin();
      const calls: string[] = [];
      let reentered = false;
      coordinator.register({
        [phase]() {
          calls.push(phase);
          if (!reentered) {
            reentered = true;
            coordinator.commit(transaction);
          }
        },
        settle() {
          calls.push('settle');
        },
      });
      coordinator.commit(transaction);
      expect(calls).toEqual([phase, 'settle']);
      expect(transaction.phase).toBe('committed');
      expect(coordinator.current).toBeNull();
    }
  );

  it('should apply every participant before publishing and settling work', () => {
    const coordinator = new CommitCoordinator();
    const calls: string[] = [];
    const transaction = coordinator.begin();
    for (const name of ['first', 'second']) {
      coordinator.register({
        apply: () => calls.push(`apply:${name}`),
        publish: () => calls.push(`publish:${name}`),
        settle: () => calls.push(`settle:${name}`),
        activate: () => calls.push(`activate:${name}`),
        complete: () => calls.push(`complete:${name}`),
        rollback: () => calls.push(`rollback:${name}`),
      });
    }
    coordinator.commit(transaction);
    expect(calls).toEqual([
      'apply:first',
      'apply:second',
      'publish:first',
      'publish:second',
      'settle:first',
      'settle:second',
      'activate:first',
      'activate:second',
      'complete:first',
      'complete:second',
    ]);
    expect(transaction.phase).toBe('committed');
    expect(coordinator.current).toBeNull();
  });

  it('should join a successful child and isolate a discarded sibling', () => {
    const coordinator = new CommitCoordinator();
    const calls: string[] = [];
    const parent = coordinator.begin();
    coordinator.register({ settle: () => calls.push('parent') });
    const child = coordinator.begin();
    coordinator.register({
      settle: () => calls.push('child'),
      complete: () => calls.push('completed'),
    });
    coordinator.commit(child);
    expect(calls).toEqual([]);
    expect(coordinator.current).toBe(parent);
    const failed = coordinator.begin();
    coordinator.register({
      settle: () => calls.push('failed'),
      complete: () => calls.push('failed completion'),
      rollback: () => calls.push('discarded'),
    });
    coordinator.discard(failed);
    coordinator.commit(parent);
    expect(calls).toEqual(['discarded', 'parent', 'child', 'completed']);
    expect(coordinator.current).toBeNull();
  });

  it('should restore all participants in reverse order when publication fails', () => {
    const rollbackErrors: unknown[] = [];
    const coordinator = new CommitCoordinator({
      rollbackError: (error) => rollbackErrors.push(error),
    });
    const calls: string[] = [];
    const failure = new Error('publication failed');
    const transaction = coordinator.begin();
    coordinator.register({ rollback: () => calls.push('first') });
    coordinator.register({
      publish() {
        throw failure;
      },
      rollback() {
        calls.push('second');
        throw new Error('restoration failed');
      },
    });
    coordinator.register({
      settle: () => calls.push('published'),
      rollback: () => calls.push('third'),
    });
    expect(() => coordinator.commit(transaction)).toThrow(failure);
    expect(calls).toEqual(['third', 'second', 'first']);
    expect(rollbackErrors).toHaveLength(1);
    expect(transaction.phase).toBe('discarded');
    expect(coordinator.current).toBeNull();
  });

  it('should drain settlement failures and allow a separate reentrant commit', () => {
    const reports: unknown[][] = [];
    const coordinator = new CommitCoordinator({
      settlementErrors: (errors) => reports.push(errors),
    });
    const calls: string[] = [];
    const transaction = coordinator.begin();
    coordinator.register({
      settle() {
        calls.push('failed');
        throw new Error('settlement failed');
      },
      rollback: () => calls.push('rollback'),
    });
    coordinator.register({
      settle() {
        expect(coordinator.current).toBeNull();
        const nested = coordinator.begin();
        coordinator.register({ settle: () => calls.push('reentrant') });
        coordinator.commit(nested);
      },
    });
    coordinator.register({ activate: () => calls.push('activated') });
    coordinator.commit(transaction);
    coordinator.discard(transaction);
    expect(calls).toEqual(['failed', 'reentrant', 'activated']);
    expect(reports).toHaveLength(1);
    expect(transaction.errors).toHaveLength(1);
    expect(transaction.phase).toBe('committed');
  });

  it('should preserve another active frame when obsolete work is discarded', () => {
    const coordinator = new CommitCoordinator();
    const obsolete = coordinator.begin();
    coordinator.commit(obsolete);
    const current = coordinator.begin();
    coordinator.discard(obsolete);
    expect(coordinator.current).toBe(current);
    coordinator.discard(current);
    expect(coordinator.current).toBeNull();
  });

  it('should restore the execution stack when a suspended preparation resumes', () => {
    const coordinator = new CommitCoordinator();
    const prepared = coordinator.begin();
    coordinator.suspend(prepared);
    expect(coordinator.current).toBeNull();
    const outer = coordinator.begin();
    const failure = new Error('application failed');
    expect(() =>
      coordinator.apply(prepared, () => {
        expect(coordinator.current).toBe(prepared);
        throw failure;
      })
    ).toThrow(failure);
    expect(coordinator.current).toBe(outer);
    coordinator.discard(prepared);
    expect(coordinator.current).toBe(outer);
    coordinator.discard(outer);
  });
});
