import { logger } from '../common/logger';
import type { Props } from '../common/props';
import type { ContextFrame } from './context';
import type { ComponentInstance } from './component-internal';
import {
  type ReadableSource,
  finalizeReadableSubscriptionsFromSnapshot,
} from './readable';
import {
  discardCommitOperations,
  executeCommittedLifecycleOperations,
} from './lifecycle-operation-settlement';

export type LifecycleOperation = () =>
  | void
  | (() => void)
  | PromiseLike<void | (() => void)>;

type LifecycleCommitBatchEntry = {
  instance: ComponentInstance;
  wasFirstMount: boolean;
};

type ReadSubscriptionCommit = {
  instance: ComponentInstance;
  ownershipGeneration: object;
  token: number;
  pendingReadSources: Set<ReadableSource<unknown>> | undefined;
  pendingReadSourceVersions: Map<ReadableSource<unknown>, number> | undefined;
};

type InlineRenderSnapshot = {
  instance: ComponentInstance;
  props: Props;
  ownerFrame: ContextFrame | null;
  portalScope: object | null;
  parentInstance: ComponentInstance | null;
  isRoot: boolean | undefined;
  vnodeParentGeneration: object | undefined;
};

export type LifecycleTransaction = {
  key: object;
  commit(): void;
  rollback(): void;
  merge?(parentTransaction: LifecycleTransaction): void;
};

type LifecycleRollback = () => void;
type LifecycleTransactionEntry = LifecycleTransaction | LifecycleRollback;

export type LifecycleCommitBatch = {
  parent: LifecycleCommitBatch | null;
  entries: LifecycleCommitBatchEntry[];
  entriesByInstance: Map<ComponentInstance, LifecycleCommitBatchEntry>;
  readCommits: ReadSubscriptionCommit[];
  readCommitsByInstance: Map<ComponentInstance, ReadSubscriptionCommit>;
  renderSnapshots: InlineRenderSnapshot[];
  renderSnapshotsByInstance: Map<ComponentInstance, InlineRenderSnapshot>;
  transactions: LifecycleTransactionEntry[];
  transactionsByKey: Map<object, LifecycleTransaction>;
  retainedElementSnapshots: Map<Element, unknown>;
  active: boolean;
};

let currentLifecycleCommitBatch: LifecycleCommitBatch | null = null;
const pendingLifecycleCommitErrors: unknown[] = [];

/** @internal Drain commit-time cleanup errors for transaction owners such as the router. */
export function drainLifecycleCommitErrors(): unknown[] {
  if (pendingLifecycleCommitErrors.length === 0) {
    return [];
  }

  return pendingLifecycleCommitErrors.splice(0);
}

export function beginLifecycleCommitBatch(): LifecycleCommitBatch {
  const batch: LifecycleCommitBatch = {
    parent: currentLifecycleCommitBatch,
    entries: [],
    entriesByInstance: new Map(),
    readCommits: [],
    readCommitsByInstance: new Map(),
    renderSnapshots: [],
    renderSnapshotsByInstance: new Map(),
    transactions: [],
    transactionsByKey: new Map(),
    retainedElementSnapshots: new Map(),
    active: true,
  };
  currentLifecycleCommitBatch = batch;
  return batch;
}

export function getCurrentLifecycleCommitBatch(): LifecycleCommitBatch | null {
  return currentLifecycleCommitBatch?.active
    ? currentLifecycleCommitBatch
    : null;
}

function enqueueLifecycleTransaction(
  batch: LifecycleCommitBatch,
  transaction: LifecycleTransaction
): void {
  if (batch.transactionsByKey.has(transaction.key)) {
    return;
  }

  batch.transactionsByKey.set(transaction.key, transaction);
  batch.transactions.push(transaction);
}

export function registerLifecycleTransaction(
  key: object,
  commit: () => void,
  rollback: () => void,
  merge?: (parentTransaction: LifecycleTransaction) => void
): boolean {
  if (!currentLifecycleCommitBatch?.active) {
    return false;
  }

  enqueueLifecycleTransaction(currentLifecycleCommitBatch, {
    key,
    commit,
    rollback,
    merge,
  });
  return true;
}

export function registerLifecycleRollback(
  rollback: LifecycleRollback
): boolean {
  if (!currentLifecycleCommitBatch?.active) {
    return false;
  }

  currentLifecycleCommitBatch.transactions.push(rollback);
  return true;
}

function closeLifecycleCommitBatch(batch: LifecycleCommitBatch): boolean {
  if (!batch.active) {
    return false;
  }

  batch.active = false;
  currentLifecycleCommitBatch = batch.parent;
  return true;
}

function enqueueLifecycleCommit(
  batch: LifecycleCommitBatch,
  instance: ComponentInstance,
  wasFirstMount: boolean
): void {
  const existing = batch.entriesByInstance.get(instance);
  if (existing) {
    existing.wasFirstMount = existing.wasFirstMount || wasFirstMount;
    return;
  }

  const entry = { instance, wasFirstMount };
  batch.entriesByInstance.set(instance, entry);
  batch.entries.push(entry);
}

export function enqueueLifecycleCommitForInstance(
  instance: ComponentInstance,
  wasFirstMount: boolean
): boolean {
  if (!currentLifecycleCommitBatch?.active) {
    return false;
  }
  enqueueLifecycleCommit(currentLifecycleCommitBatch, instance, wasFirstMount);
  return true;
}

function enqueueReadSubscriptionCommit(
  batch: LifecycleCommitBatch,
  instance: ComponentInstance,
  token: number,
  pendingReadSources: Set<ReadableSource<unknown>> | undefined,
  pendingReadSourceVersions: Map<ReadableSource<unknown>, number> | undefined,
  ownershipGeneration: object = instance._ownershipGeneration
): void {
  const existing = batch.readCommitsByInstance.get(instance);
  const commit = existing ?? {
    instance,
    ownershipGeneration,
    token,
    pendingReadSources,
    pendingReadSourceVersions,
  };

  commit.ownershipGeneration = ownershipGeneration;
  commit.token = token;
  commit.pendingReadSources = pendingReadSources
    ? new Set(pendingReadSources)
    : undefined;
  commit.pendingReadSourceVersions = pendingReadSourceVersions
    ? new Map(pendingReadSourceVersions)
    : undefined;

  if (!existing) {
    batch.readCommitsByInstance.set(instance, commit);
    batch.readCommits.push(commit);
  }
}

function enqueueInlineRenderSnapshot(
  batch: LifecycleCommitBatch,
  snapshot: InlineRenderSnapshot
): void {
  if (batch.renderSnapshotsByInstance.has(snapshot.instance)) {
    return;
  }

  batch.renderSnapshotsByInstance.set(snapshot.instance, snapshot);
  batch.renderSnapshots.push(snapshot);
}

export function captureInlineRenderSnapshot(instance: ComponentInstance): void {
  if (!currentLifecycleCommitBatch?.active) {
    return;
  }

  enqueueInlineRenderSnapshot(currentLifecycleCommitBatch, {
    instance,
    props: instance.props,
    ownerFrame: instance.ownerFrame,
    portalScope: instance.portalScope,
    parentInstance: instance.parentInstance,
    isRoot: instance.isRoot,
    vnodeParentGeneration: instance._vnodeParentGeneration,
  });
}

export function finalizeInlineReadSubscriptions(
  instance: ComponentInstance,
  token: number,
  pendingReadSources: Set<ReadableSource<unknown>> | undefined,
  pendingReadSourceVersions: Map<ReadableSource<unknown>, number> | undefined
): void {
  if (
    (!pendingReadSources || pendingReadSources.size === 0) &&
    (!instance._lastReadSources || instance._lastReadSources.size === 0)
  ) {
    return;
  }

  if (currentLifecycleCommitBatch?.active) {
    enqueueReadSubscriptionCommit(
      currentLifecycleCommitBatch,
      instance,
      token,
      pendingReadSources,
      pendingReadSourceVersions
    );
    return;
  }

  finalizeReadableSubscriptionsFromSnapshot(
    instance,
    token,
    pendingReadSources,
    pendingReadSourceVersions,
    instance._ownershipGeneration
  );
}

export function flushLifecycleCommitBatch(batch: LifecycleCommitBatch): void {
  if (!closeLifecycleCommitBatch(batch)) {
    return;
  }

  if (batch.parent?.active) {
    for (const [element, snapshot] of batch.retainedElementSnapshots) {
      if (!batch.parent.retainedElementSnapshots.has(element)) {
        batch.parent.retainedElementSnapshots.set(element, snapshot);
      }
    }
    for (const entry of batch.transactions) {
      if (typeof entry === 'function') {
        batch.parent.transactions.push(entry);
      } else {
        const existing = batch.parent.transactionsByKey.get(entry.key);
        if (existing && entry.merge) {
          entry.merge(existing);
        } else {
          enqueueLifecycleTransaction(batch.parent, entry);
        }
      }
    }
    for (const snapshot of batch.renderSnapshots) {
      enqueueInlineRenderSnapshot(batch.parent, snapshot);
    }
    for (const commit of batch.readCommits) {
      enqueueReadSubscriptionCommit(
        batch.parent,
        commit.instance,
        commit.token,
        commit.pendingReadSources,
        commit.pendingReadSourceVersions,
        commit.ownershipGeneration
      );
    }
    for (const entry of batch.entries) {
      enqueueLifecycleCommit(batch.parent, entry.instance, entry.wasFirstMount);
    }
    return;
  }

  const commitErrors: unknown[] = [];

  for (const commit of batch.readCommits) {
    try {
      finalizeReadableSubscriptionsFromSnapshot(
        commit.instance,
        commit.token,
        commit.pendingReadSources,
        commit.pendingReadSourceVersions,
        commit.ownershipGeneration
      );
    } catch (error) {
      commitErrors.push(error);
    }
  }

  // Ownership transactions register before materialization. Finalize them
  // before activating new refs, portals, resources, and tasks so shared
  // handles cannot be detached by the outgoing owner after attachment.
  for (const transaction of batch.transactions) {
    if (typeof transaction === 'function') {
      continue;
    }
    try {
      transaction.commit();
    } catch (error) {
      commitErrors.push(error);
    }
  }

  for (const entry of batch.entries) {
    try {
      executeCommittedLifecycleOperations(entry.instance, entry.wasFirstMount);
    } catch (error) {
      commitErrors.push(error);
    }
  }

  if (commitErrors.length > 0) {
    pendingLifecycleCommitErrors.push(...commitErrors);
    logger.error(
      '[Askr] committed lifecycle work failed:',
      new AggregateError(commitErrors, 'Committed lifecycle work failed')
    );
  }
}

export function discardLifecycleCommitBatch(batch: LifecycleCommitBatch): void {
  if (!closeLifecycleCommitBatch(batch)) {
    return;
  }

  for (let index = batch.transactions.length - 1; index >= 0; index -= 1) {
    try {
      const transaction = batch.transactions[index]!;
      if (typeof transaction === 'function') {
        transaction();
      } else {
        transaction.rollback();
      }
    } catch (error) {
      // Preserve the original evaluation/commit error. Rollback is best-effort
      // but every registered participant must still receive its callback.
      logger.error('[Askr] transaction rollback failed:', error);
    }
  }

  for (let index = batch.renderSnapshots.length - 1; index >= 0; index -= 1) {
    const snapshot = batch.renderSnapshots[index]!;
    snapshot.instance.props = snapshot.props;
    snapshot.instance.ownerFrame = snapshot.ownerFrame;
    snapshot.instance.portalScope = snapshot.portalScope;
    snapshot.instance.parentInstance = snapshot.parentInstance;
    snapshot.instance.isRoot = snapshot.isRoot;
    snapshot.instance._vnodeParentGeneration = snapshot.vnodeParentGeneration;
  }

  for (const entry of batch.entries) {
    if (entry.wasFirstMount) {
      entry.instance.mountOperations = undefined;
    }
    discardCommitOperations(entry.instance);
  }
}
