import { isPromiseLike } from '../common/promise';
import {
  enqueueRuntimeTask,
  getRuntimeRenderer,
  runRuntimeWithSyncProgress,
} from './access';
import { commitLifecycleForInstance } from './component-lifecycle';
import { beginRenderTracking, clearRenderTracking } from './component-scope';
import { routeComponentErrorToBoundary } from './error-boundary';
import type { ComponentInstance } from './component-internal';
import {
  applyTransaction,
  beginCommitTransaction,
  captureInlineRenderSnapshot,
  commitTransaction,
  discardTransaction,
  finalizeInlineReadSubscriptions,
  suspendTransaction,
} from './render-transaction';
import { setDevValue } from './dev-namespace';

export function runScheduledComponent(
  instance: ComponentInstance,
  execute: (instance: ComponentInstance) => unknown
): void {
  const owner = instance.ownership;
  const ownershipGeneration = owner.identity;
  const evaluationGeneration = instance.evaluationGeneration;
  const transaction = beginCommitTransaction();
  instance.notifyUpdate = instance._enqueueRun!;
  captureInlineRenderSnapshot(instance);
  beginRenderTracking(instance);
  const token = instance._currentRenderToken!;
  let result: unknown;
  let fast = false;
  try {
    result = execute(instance);
    if (isPromiseLike(result))
      throw new Error(
        'Async components are not supported. Components must be synchronous.'
      );
    finalizeInlineReadSubscriptions(
      instance,
      token,
      instance._pendingReadSources,
      instance._pendingReadSourceVersions
    );
    fast = getRuntimeRenderer().classifyComponentUpdate(
      instance,
      result
    ).useFastPath;
    if (!fast) {
      setDevValue('__LAST_FASTPATH_STATS', undefined);
      setDevValue('__LAST_FASTPATH_COMMIT_COUNT', 0);
    }
  } catch (error) {
    discardTransaction(transaction);
    if (!routeComponentErrorToBoundary(instance, error)) throw error;
    return;
  } finally {
    clearRenderTracking(instance);
    suspendTransaction(transaction);
  }

  const apply = (): void => {
    if (
      owner.disposed ||
      instance.ownership !== owner ||
      owner.identity !== ownershipGeneration ||
      instance.evaluationGeneration !== evaluationGeneration
    ) {
      discardTransaction(transaction);
      return;
    }
    try {
      transaction.deferNotifications = fast;
      const applied = applyTransaction(transaction, () => {
        const wasFirstMount = !owner.mounted;
        if (
          !getRuntimeRenderer().applyComponentResult(
            instance,
            result,
            fast ? 'keyed-reorder' : 'ordinary'
          )
        )
          return false;
        owner.mounted = true;
        commitLifecycleForInstance(instance, wasFirstMount);
        return true;
      });
      if (applied) commitTransaction(transaction);
      else discardTransaction(transaction);
    } catch (error) {
      discardTransaction(transaction);
      if (!routeComponentErrorToBoundary(instance, error)) throw error;
    } finally {
      suspendTransaction(transaction);
    }
  };

  if (fast) runRuntimeWithSyncProgress(apply);
  else enqueueRuntimeTask(apply);
}
