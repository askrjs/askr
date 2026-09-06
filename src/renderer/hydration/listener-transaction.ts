import {
  beginCommitTransaction,
  commitTransaction,
  discardTransaction,
  suspendTransaction,
  registerCommitParticipant,
  type CommitTransaction,
} from '../../runtime/transactions/access';
import { drainOwnedCleanup } from '../../runtime/ownership/record';

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
  readonly active: boolean;
  commit: CommitTransaction;
}

let currentTransaction: HydrationListenerTransaction | null = null;

export function beginHydrationListenerTransaction(): HydrationListenerTransaction {
  const transaction: HydrationListenerTransaction = {
    parent: getCurrentHydrationListenerTransaction(),
    stages: [],
    get active() {
      for (
        let frame: CommitTransaction | null = this.commit;
        frame;
        frame = frame.parent
      )
        if (!frame.active) return false;
      return true;
    },
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
      drainOwnedCleanup(transaction.stages.splice(0).reverse(), (stage) =>
        stage.rollback()
      );
    },
    settle() {
      transaction.stages.length = 0;
    },
  });
  return transaction;
}

export function stageHydrationListener(stage: HydrationListenerStage): boolean {
  const transaction = getCurrentHydrationListenerTransaction();
  if (!transaction) return false;
  transaction.stages.push(stage);
  return true;
}

export function hasStagedHydrationListener(
  target: Element,
  eventName: string,
  capture: boolean
): boolean {
  return !!getCurrentHydrationListenerTransaction()?.stages.some(
    (stage) =>
      stage.target === target &&
      stage.eventName === eventName &&
      stage.capture === capture
  );
}

function finishTransaction(
  transaction: HydrationListenerTransaction,
  commit: boolean
): void {
  if (currentTransaction === transaction)
    currentTransaction = transaction.parent;
  try {
    if (commit && transaction.active) commitTransaction(transaction.commit);
    else discardTransaction(transaction.commit);
  } finally {
    suspendTransaction(transaction.commit);
  }
}

export function commitHydrationListenerTransaction(
  transaction: HydrationListenerTransaction
): void {
  finishTransaction(transaction, true);
}

export function discardHydrationListenerTransaction(
  transaction: HydrationListenerTransaction
): void {
  finishTransaction(transaction, false);
}

export function getCurrentHydrationListenerTransaction(): HydrationListenerTransaction | null {
  while (currentTransaction && !currentTransaction.active) {
    const stale = currentTransaction;
    currentTransaction = currentTransaction.parent;
    discardTransaction(stale.commit);
  }
  return currentTransaction;
}
