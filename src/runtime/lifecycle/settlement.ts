import { isPromiseLike } from '../../common/promise';
import { logger } from '../../common/logger';
import type { ComponentInstance } from '../component/instance';
import { ownCleanup, type OwnershipRecord } from '../ownership/record';
import {
  getCurrentCommitTransaction,
  registerCommitParticipant,
} from '../transactions/access';
import type { CommitParticipant } from '../transactions/coordinator';

export type LifecycleOperation = () =>
  | void
  | (() => void)
  | PromiseLike<void | (() => void)>;

const LIFECYCLE_COMMIT = {};

class LifecycleCommit implements CommitParticipant {
  readonly kind = LIFECYCLE_COMMIT;
  readonly key: ComponentInstance;
  owner: OwnershipRecord;
  generation: object;
  firstMount: boolean;
  private mounts: LifecycleOperation[] | undefined;
  private commits: LifecycleOperation[] | undefined;
  private prepared = false;

  constructor(instance: ComponentInstance, firstMount: boolean) {
    this.key = instance;
    this.owner = instance.owner;
    this.generation = instance.owner.identity;
    this.firstMount = firstMount;
  }

  merge(parent: CommitParticipant): void {
    (parent as LifecycleCommit).update(
      this.owner,
      this.generation,
      this.firstMount
    );
  }

  update(
    owner: OwnershipRecord,
    generation: object,
    firstMount: boolean
  ): void {
    this.firstMount =
      this.generation === generation
        ? this.firstMount || firstMount
        : firstMount;
    this.owner = owner;
    this.generation = generation;
  }

  private live(): boolean {
    return (
      this.key.owner === this.owner &&
      this.owner.identity === this.generation &&
      !this.owner.disposed
    );
  }

  publish(): void {
    if (!this.live()) return;
    if (this.firstMount) {
      this.mounts = this.key.mountOperations;
      this.key.mountOperations = undefined;
    }
    this.commits = this.key.commitOperations;
    this.key.commitOperations = undefined;
    this.prepared = true;
  }

  activate(): void {
    if (this.prepared && this.live())
      executeOwnedLifecycleOperations(
        this.key.id,
        this.owner,
        this.mounts,
        this.commits
      );
  }

  rollback(): void {
    if (!this.live()) return;
    if (this.firstMount) this.key.mountOperations = undefined;
    discardCommitOperations(this.key);
  }
}

export function enqueueLifecycleCommitForInstance(
  instance: ComponentInstance,
  firstMount: boolean
): boolean {
  const transaction = getCurrentCommitTransaction();
  if (!transaction) return false;
  const previous = transaction.participant<LifecycleCommit>(
    instance,
    LIFECYCLE_COMMIT
  );
  if (previous) {
    previous.update(instance.owner, instance.owner.identity, firstMount);
  } else registerCommitParticipant(new LifecycleCommit(instance, firstMount));
  return true;
}

function settleLifecycleOperationResult(
  owner: OwnershipRecord,
  result: LifecycleOperation extends (...args: never[]) => infer TResult
    ? TResult
    : never
): void {
  if (isPromiseLike(result)) {
    Promise.resolve(result).then(
      (cleanup) => {
        if (typeof cleanup === 'function') {
          if (!owner.disposed && owner.mounted) {
            ownCleanup(owner, cleanup);
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
    ownCleanup(owner, result);
  }
}

export function discardCommitOperations(instance: ComponentInstance): void {
  instance.commitOperations = undefined;
}

function executeOwnedLifecycleOperations(
  id: string,
  owner: OwnershipRecord,
  mounts: LifecycleOperation[] | undefined,
  commits: LifecycleOperation[] | undefined
): void {
  const errors: unknown[] = [];
  for (const operations of [mounts, commits]) {
    for (const operation of operations ?? []) {
      try {
        settleLifecycleOperationResult(owner, operation());
      } catch (error) {
        errors.push(error);
      }
    }
  }

  if (errors.length > 0) {
    throw new AggregateError(
      errors,
      `Committed lifecycle operations failed for ${id}`
    );
  }
}
