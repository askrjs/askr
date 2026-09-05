import {
  beginCommitTransaction,
  commitTransaction,
  discardTransaction,
  suspendTransaction,
  registerCommitParticipant,
  type CommitTransaction,
} from '../runtime/transaction-access';

export type HydrationListenerStageKind = 'direct' | 'delegated';

export interface HydrationListenerStage {
  kind: HydrationListenerStageKind;
  target: Element;
  eventName: string;
  capture: boolean;
  publish: () => void;
  rollback: () => void;
}

export interface HydrationListenerTransaction {
  parent: HydrationListenerTransaction | null;
  stages: HydrationListenerStage[];
  active: boolean;
  commit: CommitTransaction;
}

let currentTransaction: HydrationListenerTransaction | null = null;

export function beginHydrationListenerTransaction(): HydrationListenerTransaction {
  const transaction: HydrationListenerTransaction = {
    parent: currentTransaction,
    stages: [],
    active: true,
    commit: beginCommitTransaction(),
  };
  currentTransaction = transaction;
  registerCommitParticipant({
    apply() {
      const stages = transaction.stages
        .slice()
        .sort((left, right) =>
          left.kind !== right.kind
            ? left.kind === 'delegated'
              ? -1
              : 1
            : left.eventName.localeCompare(right.eventName)
        );
      for (const stage of stages) stage.publish();
    },
    rollback() {
      const errors: unknown[] = [];
      for (let index = transaction.stages.length - 1; index >= 0; index--) {
        try {
          transaction.stages[index]!.rollback();
        } catch (error) {
          errors.push(error);
        }
      }
      transaction.stages.length = 0;
      if (errors.length)
        throw new AggregateError(
          errors,
          'Hydration listener restoration failed'
        );
    },
    settle() {
      transaction.stages.length = 0;
    },
  });
  return transaction;
}

export function stageHydrationListener(stage: HydrationListenerStage): boolean {
  if (!currentTransaction?.active) return false;
  currentTransaction.stages.push(stage);
  return true;
}

export function hasStagedHydrationListener(
  target: Element,
  eventName: string,
  capture: boolean
): boolean {
  return !!currentTransaction?.stages.some(
    (stage) =>
      stage.target === target &&
      stage.eventName === eventName &&
      stage.capture === capture
  );
}

function closeTransaction(transaction: HydrationListenerTransaction): boolean {
  if (!transaction.active) return false;
  transaction.active = false;
  if (currentTransaction === transaction) {
    let parent = transaction.parent;
    while (parent && !parent.active) parent = parent.parent;
    currentTransaction = parent;
  }
  return true;
}

export function commitHydrationListenerTransaction(
  transaction: HydrationListenerTransaction
): void {
  if (!closeTransaction(transaction)) return;
  try {
    commitTransaction(transaction.commit);
  } finally {
    suspendTransaction(transaction.commit);
  }
}

export function discardHydrationListenerTransaction(
  transaction: HydrationListenerTransaction
): void {
  closeTransaction(transaction);
  discardTransaction(transaction.commit);
  suspendTransaction(transaction.commit);
}

export function getCurrentHydrationListenerTransaction(): HydrationListenerTransaction | null {
  return currentTransaction?.active ? currentTransaction : null;
}
