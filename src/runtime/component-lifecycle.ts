import { isDevelopmentEnvironment } from '../common/env';
import { isPromiseLike } from '../common/promise';
import type { Props } from '../common/props';
import { logger } from '../common/logger';
import type { ContextFrame } from './context';
import type { ComponentInstance } from './component-internal';
import { isBulkCommitActive } from './fastlane';
import {
  type ReadableSource,
  finalizeReadableSubscriptionsFromSnapshot,
} from './readable';

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

export type LifecycleCommitBatch = {
  parent: LifecycleCommitBatch | null;
  entries: LifecycleCommitBatchEntry[];
  entriesByInstance: Map<ComponentInstance, LifecycleCommitBatchEntry>;
  readCommits: ReadSubscriptionCommit[];
  readCommitsByInstance: Map<ComponentInstance, ReadSubscriptionCommit>;
  renderSnapshots: InlineRenderSnapshot[];
  renderSnapshotsByInstance: Map<ComponentInstance, InlineRenderSnapshot>;
  active: boolean;
};

let currentLifecycleCommitBatch: LifecycleCommitBatch | null = null;

export function beginLifecycleCommitBatch(): LifecycleCommitBatch {
  const batch: LifecycleCommitBatch = {
    parent: currentLifecycleCommitBatch,
    entries: [],
    entriesByInstance: new Map(),
    readCommits: [],
    readCommitsByInstance: new Map(),
    renderSnapshots: [],
    renderSnapshotsByInstance: new Map(),
    active: true,
  };
  currentLifecycleCommitBatch = batch;
  return batch;
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

  for (const commit of batch.readCommits) {
    finalizeReadableSubscriptionsFromSnapshot(
      commit.instance,
      commit.token,
      commit.pendingReadSources,
      commit.pendingReadSourceVersions
    );
  }

  for (const entry of batch.entries) {
    executeCommittedLifecycleOperations(entry.instance, entry.wasFirstMount);
  }
}

export function discardLifecycleCommitBatch(batch: LifecycleCommitBatch): void {
  if (!closeLifecycleCommitBatch(batch)) {
    return;
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

function settleLifecycleOperationResult(
  instance: ComponentInstance,
  lifecycleGeneration: number,
  result: void | (() => void) | PromiseLike<void | (() => void)>
): void {
  if (isPromiseLike(result)) {
    Promise.resolve(result).then(
      (cleanup) => {
        if (typeof cleanup === 'function') {
          if (
            instance.lifecycleGeneration === lifecycleGeneration &&
            instance.mounted
          ) {
            instance.cleanupFns.push(cleanup);
            return;
          }

          try {
            cleanup();
          } catch (err) {
            logger.error('[Askr] async mount cleanup failed:', err);
          }
        }
      },
      (err) => {
        logger.error('[Askr] async mount operation failed:', err);
      }
    );
  } else if (typeof result === 'function') {
    instance.cleanupFns.push(result);
  }
}

function executeMountOperations(instance: ComponentInstance): void {
  const mountOperations = instance.mountOperations;
  if (mountOperations.length === 0) {
    return;
  }

  const lifecycleGeneration = instance.lifecycleGeneration;

  for (const operation of mountOperations) {
    settleLifecycleOperationResult(instance, lifecycleGeneration, operation());
  }
  // Clear the operations array so they don't run again on subsequent renders
  instance.mountOperations = [];
}

function executeCommitOperations(instance: ComponentInstance): void {
  const commitOperations = instance.commitOperations;
  if (commitOperations.length === 0) {
    return;
  }

  instance.commitOperations = [];
  const lifecycleGeneration = instance.lifecycleGeneration;

  for (const operation of commitOperations) {
    settleLifecycleOperationResult(instance, lifecycleGeneration, operation());
  }
}

export function discardCommitOperations(instance: ComponentInstance): void {
  instance.commitOperations = [];
}

export function executeCommittedLifecycleOperations(
  instance: ComponentInstance,
  wasFirstMount: boolean
): void {
  if (wasFirstMount && instance.mountOperations.length > 0) {
    executeMountOperations(instance);
  }
  if (instance.commitOperations.length > 0) {
    executeCommitOperations(instance);
  }
}

export function commitLifecycleForInstance(
  instance: ComponentInstance,
  wasFirstMount: boolean
): void {
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
  if (instance.mounted && instance.commitOperations.length > 0) {
    commitLifecycleForInstance(instance, false);
  }
}
