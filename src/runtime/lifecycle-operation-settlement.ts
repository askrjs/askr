import { isPromiseLike } from '../common/promise';
import { logger } from '../common/logger';
import type { ComponentInstance } from './component-internal';
import type { LifecycleOperation } from './lifecycle-batch';

function settleLifecycleOperationResult(
  instance: ComponentInstance,
  lifecycleGeneration: number,
  result: LifecycleOperation extends (...args: never[]) => infer TResult
    ? TResult
    : never
): void {
  if (isPromiseLike(result)) {
    Promise.resolve(result).then(
      (cleanup) => {
        if (typeof cleanup === 'function') {
          if (
            instance.lifecycleGeneration === lifecycleGeneration &&
            instance.mounted
          ) {
            (instance.cleanupFns ??= []).push(cleanup);
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
    (instance.cleanupFns ??= []).push(result);
  }
}

function executeOperations(
  instance: ComponentInstance,
  operations: LifecycleOperation[]
): unknown[] {
  if (operations.length === 0) {
    return [];
  }

  const lifecycleGeneration = instance.lifecycleGeneration;
  const errors: unknown[] = [];
  for (const operation of operations) {
    try {
      settleLifecycleOperationResult(
        instance,
        lifecycleGeneration,
        operation()
      );
    } catch (error) {
      errors.push(error);
    }
  }
  return errors;
}

export function discardCommitOperations(instance: ComponentInstance): void {
  instance.commitOperations = undefined;
}

export function executeCommittedLifecycleOperations(
  instance: ComponentInstance,
  wasFirstMount: boolean
): void {
  const errors: unknown[] = [];
  if (wasFirstMount && (instance.mountOperations?.length ?? 0) > 0) {
    const operations = instance.mountOperations!;
    instance.mountOperations = undefined;
    errors.push(...executeOperations(instance, operations));
  }
  if ((instance.commitOperations?.length ?? 0) > 0) {
    const operations = instance.commitOperations!;
    instance.commitOperations = undefined;
    errors.push(...executeOperations(instance, operations));
  }

  if (errors.length > 0) {
    throw new AggregateError(
      errors,
      `Committed lifecycle operations failed for ${instance.id}`
    );
  }
}
