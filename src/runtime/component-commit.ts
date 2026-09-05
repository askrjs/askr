import { isDevelopmentEnvironment } from '../common/env';
import { isPromiseLike } from '../common/promise';
import { enqueueRuntimeTask, getRuntimeRenderer } from './access';
import { discardCommitOperations } from './component-lifecycle';
import { beginRenderTracking } from './component-scope';
import { tryRuntimeFastLaneSync } from './fastlane';
import { routeComponentErrorToBoundary } from './error-boundary';
import type { ComponentInstance } from './component-internal';
import type { ComponentCommitSettlement } from './renderer-capabilities';

export interface ScheduledComponentCommitHost extends ComponentCommitSettlement {
  execute(instance: ComponentInstance): unknown | Promise<unknown>;
}

export function runScheduledComponent(
  instance: ComponentInstance,
  host: ScheduledComponentCommitHost
): void {
  const ownershipGeneration = instance.ownership.identity;
  const evaluationGeneration = instance.evaluationGeneration;
  instance.notifyUpdate = instance._enqueueRun!;
  beginRenderTracking(instance);
  let result: unknown | Promise<unknown>;
  try {
    result = host.execute(instance);
  } catch (err) {
    discardCommitOperations(instance);
    if (routeComponentErrorToBoundary(instance, err)) {
      return;
    }
    throw err;
  }

  if (isPromiseLike(result)) {
    const error = new Error(
      'Async components are not supported. Components must be synchronous.'
    );
    discardCommitOperations(instance);
    if (routeComponentErrorToBoundary(instance, error)) {
      return;
    }
    throw error;
  }

  try {
    const used = tryRuntimeFastLaneSync(instance, result);
    if (used) {
      return;
    }
  } catch (err) {
    if (routeComponentErrorToBoundary(instance, err)) {
      return;
    }
    if (isDevelopmentEnvironment()) throw err;
  }

  enqueueRuntimeTask(() => {
    try {
      if (
        instance.ownership.identity !== ownershipGeneration ||
        instance.evaluationGeneration !== evaluationGeneration
      ) {
        return;
      }

      getRuntimeRenderer().applyComponentResult(instance, result, host);
    } catch (err) {
      if (!routeComponentErrorToBoundary(instance, err)) {
        throw err;
      }
    }
  });
}
