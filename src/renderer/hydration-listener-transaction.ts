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
}

let currentTransaction: HydrationListenerTransaction | null = null;

export function beginHydrationListenerTransaction(): HydrationListenerTransaction {
  const transaction: HydrationListenerTransaction = {
    parent: currentTransaction,
    stages: [],
    active: true,
  };
  currentTransaction = transaction;
  return transaction;
}

export function stageHydrationListener(stage: HydrationListenerStage): boolean {
  if (!currentTransaction?.active) {
    return false;
  }

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
  if (!transaction.active) {
    return false;
  }

  transaction.active = false;
  currentTransaction = transaction.parent;
  return true;
}

export function commitHydrationListenerTransaction(
  transaction: HydrationListenerTransaction
): void {
  if (!closeTransaction(transaction)) {
    return;
  }

  // Publish delegated handlers before direct capture handlers. Delegated
  // publication is internally coalesced by container and event type, while
  // the stable order keeps capture listeners deterministic for mixed trees.
  const stages = [...transaction.stages].sort((left, right) => {
    if (left.kind !== right.kind) {
      return left.kind === 'delegated' ? -1 : 1;
    }
    return left.eventName.localeCompare(right.eventName);
  });

  const published: HydrationListenerStage[] = [];
  try {
    for (const stage of stages) {
      stage.publish();
      published.push(stage);
    }
  } catch (error) {
    for (let index = published.length - 1; index >= 0; index -= 1) {
      try {
        published[index]!.rollback();
      } catch {
        // Preserve the publication error. The renderer cleanup path will make
        // a second exactly-once teardown attempt for any remaining state.
      }
    }
    throw error;
  }
}

export function discardHydrationListenerTransaction(
  transaction: HydrationListenerTransaction
): void {
  if (!closeTransaction(transaction)) {
    return;
  }

  for (let index = transaction.stages.length - 1; index >= 0; index -= 1) {
    try {
      transaction.stages[index]!.rollback();
    } catch {
      // There is no provisional native listener to remove before publication.
    }
  }
}

export function getCurrentHydrationListenerTransaction(): HydrationListenerTransaction | null {
  return currentTransaction?.active ? currentTransaction : null;
}
