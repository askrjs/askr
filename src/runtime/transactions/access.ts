import { defaultRuntimeState } from '../runtime-state';
import type { CommitParticipant, CommitTransaction } from './coordinator';

export type { CommitParticipant, CommitTransaction } from './coordinator';

/**
 * Resolved per call rather than captured at import time.
 *
 * Binding the coordinator once when this module is first evaluated meant these
 * helpers could never follow a runtime whose state was replaced afterwards —
 * the import order of an unrelated module decided which coordinator they used.
 */
function commitCoordinator(): typeof defaultRuntimeState.commits {
  return defaultRuntimeState.commits;
}

export function beginCommitTransaction(): CommitTransaction {
  return commitCoordinator().begin();
}

export function getCurrentCommitTransaction(): CommitTransaction | null {
  const transaction = commitCoordinator().current;
  return transaction?.active ? transaction : null;
}

export function deferCommitNotification(
  key: object,
  notify: () => void
): boolean {
  return commitCoordinator().deferCompletion(key, notify);
}

export function commitTransaction(transaction: CommitTransaction): void {
  commitCoordinator().commit(transaction);
}

export function discardTransaction(transaction: CommitTransaction): void {
  commitCoordinator().discard(transaction);
}

export function suspendTransaction(transaction: CommitTransaction): void {
  commitCoordinator().suspend(transaction);
}

export function applyTransaction<T>(
  transaction: CommitTransaction,
  operation: () => T
): T {
  return commitCoordinator().apply(transaction, operation);
}

export function registerCommitParticipant(
  participant: CommitParticipant
): boolean {
  return commitCoordinator().register(participant);
}

export function registerCommitEffect(
  key: object,
  settle: () => void,
  rollback: () => void,
  merge?: (parent: CommitParticipant) => void
): boolean {
  return registerCommitParticipant({ key, settle, rollback, merge });
}

export function registerCommitRollback(rollback: () => void): boolean {
  return registerCommitParticipant({ rollback });
}

export function runCommitTransaction<T>(operation: () => T): T {
  const transaction = beginCommitTransaction();
  try {
    const result = applyTransaction(transaction, operation);
    commitTransaction(transaction);
    return result;
  } catch (error) {
    discardTransaction(transaction);
    throw error;
  } finally {
    suspendTransaction(transaction);
  }
}

/** Operation boundaries reuse their enclosing transaction, or own its lifetime. */
export function runCommitOperation<T>(operation: () => T): T {
  return getCurrentCommitTransaction()
    ? operation()
    : runCommitTransaction(operation);
}
