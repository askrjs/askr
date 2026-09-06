import { describe, expect, it } from 'vite-plus/test';
import { CommitCoordinator } from '../../../src/runtime/transactions/coordinator';

describe('shared commit coordination', () => {
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
