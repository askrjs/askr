import { defaultRuntimeState } from './runtime-state';
import type {
  CommitParticipant,
  CommitTransaction,
} from './transaction-coordinator';

export type {
  CommitParticipant,
  CommitTransaction,
} from './transaction-coordinator';

const commits = defaultRuntimeState.commits;

export function beginCommitTransaction(): CommitTransaction {
  return commits.begin();
}

export function getCurrentCommitTransaction(): CommitTransaction | null {
  const transaction = commits.current;
  return transaction?.active ? transaction : null;
}

export function deferCommitNotification(
  key: object,
  notify: () => void
): boolean {
  return commits.deferCompletion(key, notify);
}

export function commitTransaction(transaction: CommitTransaction): void {
  commits.commit(transaction);
}

export function discardTransaction(transaction: CommitTransaction): void {
  commits.discard(transaction);
}

export function suspendTransaction(transaction: CommitTransaction): void {
  commits.suspend(transaction);
}

export function applyTransaction<T>(
  transaction: CommitTransaction,
  operation: () => T
): T {
  return commits.apply(transaction, operation);
}

export function registerCommitParticipant(
  participant: CommitParticipant
): boolean {
  return commits.register(participant);
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
