import { defaultRuntimeState } from './runtime-state';
import type {
  CommitParticipant,
  CommitTransaction,
} from './transaction-coordinator';

export type {
  CommitParticipant,
  CommitTransaction,
} from './transaction-coordinator';

export function beginCommitTransaction(): CommitTransaction {
  return defaultRuntimeState.commits.begin();
}

export function getCurrentCommitTransaction(): CommitTransaction | null {
  const transaction = defaultRuntimeState.commits.current;
  return transaction?.active ? transaction : null;
}

export function deferCommitNotification(
  key: object,
  notify: () => void
): boolean {
  return defaultRuntimeState.commits.deferCompletion(key, notify);
}

export function commitTransaction(transaction: CommitTransaction): void {
  defaultRuntimeState.commits.commit(transaction);
}

export function discardTransaction(transaction: CommitTransaction): void {
  defaultRuntimeState.commits.discard(transaction);
}

export function suspendTransaction(transaction: CommitTransaction): void {
  defaultRuntimeState.commits.suspend(transaction);
}

export function applyTransaction<T>(
  transaction: CommitTransaction,
  operation: () => T
): T {
  return defaultRuntimeState.commits.apply(transaction, operation);
}

export function registerCommitParticipant(
  participant: CommitParticipant
): boolean {
  return defaultRuntimeState.commits.register(participant);
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
