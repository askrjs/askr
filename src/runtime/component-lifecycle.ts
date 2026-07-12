import { isDevelopmentEnvironment } from '../common/env';
import type { Props } from '../common/props';
import { logger } from '../common/logger';
import type { ContextFrame } from './context';
import type { ComponentInstance } from './component-internal';
import { isBulkCommitActive } from './fastlane';
import {
  type ReadableSource,
  finalizeReadableSubscriptionsFromSnapshot,
} from './readable';
import {
  discardCommitOperations,
  executeCommittedLifecycleOperations,
} from './lifecycle-operation-settlement';

export {
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

function enqueueReadSubscriptionCommit(
  batch: LifecycleCommitBatch,
  instance: ComponentInstance,
  token: number,
  pendingReadSources: Set<ReadableSource<unknown>> | undefined,
  pendingReadSourceVersions: Map<ReadableSource<unknown>, number> | undefined
): void {
  const existing = batch.readCommitsByInstance.get(instance);
  const commit = existing ?? {
    instance,
    token,
    pendingReadSources,
    pendingReadSourceVersions,
  };

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
    pendingReadSourceVersions
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
        commit.pendingReadSourceVersions
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
        commit.pendingReadSourceVersions
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
  }

  for (const entry of batch.entries) {
    if (entry.wasFirstMount) {
      entry.instance.mountOperations = [];
    }
    discardCommitOperations(entry.instance);
  }
}

export function registerMountOperationForInstance(
  instance: ComponentInstance | null,
  operation: LifecycleOperation
): void {
  if (instance) {
    // If we're in bulk-commit fast lane, registering mount operations is a
    // violation of the fast-lane preconditions. Throw in dev, otherwise ignore
    // silently in production (we must avoid scheduling work during bulk commit).
    if (isBulkCommitActive()) {
      if (isDevelopmentEnvironment()) {
        throw new Error(
          'registerMountOperation called during bulk commit fast-lane'
        );
      }
      return;
    }
    instance.mountOperations.push(operation);
  }
}

export function registerCommitOperationForInstance(
  instance: ComponentInstance | null,
  operation: LifecycleOperation
): void {
  if (instance) {
    if (isBulkCommitActive()) {
      if (isDevelopmentEnvironment()) {
        throw new Error(
          'registerCommitOperation called during bulk commit fast-lane'
        );
      }
      return;
    }
    instance.commitOperations.push(operation);
  }
}

export function commitLifecycleForInstance(
  instance: ComponentInstance,
  wasFirstMount: boolean
): void {
  if (
    (instance.mountOperations?.length ?? 0) === 0 &&
    (instance.commitOperations?.length ?? 0) === 0
  ) {
    return;
  }

  if (currentLifecycleCommitBatch) {
    enqueueLifecycleCommit(
      currentLifecycleCommitBatch,
      instance,
      wasFirstMount
    );
    return;
  }

  executeCommittedLifecycleOperations(instance, wasFirstMount);
}

export function commitRenderedComponent(instance: ComponentInstance): void {
  if (instance.mounted && (instance.commitOperations?.length ?? 0) > 0) {
    commitLifecycleForInstance(instance, false);
  }
}
