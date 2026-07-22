import { isDevelopmentEnvironment } from '../common/env';
import { isPromiseLike } from '../common/promise';
import { logger } from '../common/logger';
import { enqueueRuntimeTask, getRuntimeRenderer } from './access';
import {
  beginLifecycleCommitBatch,
  discardCommitOperations,
  discardLifecycleCommitBatch,
  commitLifecycleForInstance,
  flushLifecycleCommitBatch,
} from './component-lifecycle';
import {
  beginRenderTracking,
  enterDomCommitScope,
  restoreDomCommitScope,
} from './component-scope';
import { getExecutionContextFrame, withContext } from './context';
import { incDevCounter, setDevValue } from './dev-namespace';
import { tryRuntimeFastLaneSync } from './fastlane';
import type { ComponentInstance } from './component-internal';

export interface ScheduledComponentCommitHost {
  execute(instance: ComponentInstance): unknown | Promise<unknown>;
  finalizeReadSubscriptions(instance: ComponentInstance): void;
  commitRenderedComponent(instance: ComponentInstance): void;
}

export function runScheduledComponent(
  instance: ComponentInstance,
  host: ScheduledComponentCommitHost
): void {
  const ownershipGeneration = instance._ownershipGeneration;
  const evaluationGeneration = instance.evaluationGeneration;
  instance.notifyUpdate = instance._enqueueRun!;
  beginRenderTracking(instance);
  let result: unknown | Promise<unknown>;
  try {
    result = host.execute(instance);
  } catch (err) {
    discardCommitOperations(instance);
    throw err;
  }

  if (isPromiseLike(result)) {
    throw new Error(
      'Async components are not supported. Components must be synchronous.'
    );
  }

  try {
    const used = tryRuntimeFastLaneSync(instance, result);
    if (used) {
      return;
    }
  } catch (err) {
    if (isDevelopmentEnvironment()) throw err;
  }

  enqueueRuntimeTask(() => {
    if (
      instance._ownershipGeneration !== ownershipGeneration ||
      instance.evaluationGeneration !== evaluationGeneration
    ) {
      return;
    }

    if (!instance.target && instance._placeholder) {
      commitPlaceholderReplacement(instance, result, host);
      return;
    }

    if (instance.target) {
      commitToTarget(instance, result, host);
    }
  });
}

function commitPlaceholderReplacement(
  instance: ComponentInstance,
  result: unknown,
  host: ScheduledComponentCommitHost
): void {
  if (result === null || result === undefined) {
    host.finalizeReadSubscriptions(instance);
    host.commitRenderedComponent(instance);
    return;
  }

  const placeholder = instance._placeholder!;
  const parent = placeholder.parentNode;
  if (!parent) {
    logger.warn('[Askr] placeholder no longer in DOM, cannot render component');
    return;
  }

  const renderer = getRuntimeRenderer();
  const rangeReplacement = renderer.replaceComponentRange(
    instance,
    result,
    placeholder
  );
  if (rangeReplacement) {
    if (rangeReplacement instanceof Element) {
      instance.target = rangeReplacement;
      instance._placeholder = undefined;
    } else {
      instance.target = null;
      instance._placeholder = rangeReplacement as Comment;
    }
    host.finalizeReadSubscriptions(instance);
    host.commitRenderedComponent(instance);
    return;
  }
  const hostElement = document.createElement('div');
  const executionFrame = getExecutionContextFrame(instance.ownerFrame);

  const oldInstance = enterDomCommitScope(instance);
  const lifecycleBatch = beginLifecycleCommitBatch();
  try {
    try {
      withContext(executionFrame, () => {
        renderer.evaluate(result, hostElement);
      });
      const onlyChild =
        hostElement.childNodes.length === 1 ? hostElement.firstChild : null;
      const replacement =
        onlyChild instanceof Element ? onlyChild : hostElement;
      if (replacement === hostElement) {
        (
          hostElement as Element & { __ASKR_WRAPPER_HOST?: boolean }
        ).__ASKR_WRAPPER_HOST = true;
      }
      parent.replaceChild(replacement, placeholder);

      instance.target = replacement;
      const instanceHost = replacement as Element & {
        __ASKR_INSTANCE?: ComponentInstance;
        __ASKR_INSTANCES?: ComponentInstance[];
      };
      const instances = instanceHost.__ASKR_INSTANCES ?? [];
      if (!instances.includes(instance)) {
        instances.push(instance);
      }
      instanceHost.__ASKR_INSTANCES = instances;
      instanceHost.__ASKR_INSTANCE = instances[0] ?? instance;
    } catch (err) {
      discardLifecycleCommitBatch(lifecycleBatch);
      throw err;
    }

    instance._placeholder = undefined;

    host.finalizeReadSubscriptions(instance);
    host.commitRenderedComponent(instance);
    flushLifecycleCommitBatch(lifecycleBatch);
  } finally {
    restoreDomCommitScope(oldInstance);
  }
}

function commitToTarget(
  instance: ComponentInstance,
  result: unknown,
  host: ScheduledComponentCommitHost
): void {
  const renderer = getRuntimeRenderer();
  const target = instance.target!;
  let oldChildren: Node[] = [];
  let restoredOldChildren = false;

  try {
    const wasFirstMount = !instance.mounted;
    const oldInstance = enterDomCommitScope(instance);
    const executionFrame = getExecutionContextFrame(instance.ownerFrame);
    oldChildren = Array.from(target.childNodes);

    const lifecycleBatch = beginLifecycleCommitBatch();
    try {
      try {
        withContext(executionFrame, () => {
          renderer.evaluate(result, target, undefined, instance);
        });
      } catch (err) {
        discardLifecycleCommitBatch(lifecycleBatch);
        throw err;
      }
    } catch (err) {
      cleanupFailedCommitChildren(renderer, target, oldChildren);
      try {
        incDevCounter('__DOM_REPLACE_COUNT');
        setDevValue(
          '__LAST_DOM_REPLACE_STACK_COMPONENT_RESTORE',
          new Error().stack
        );
      } catch (devErr) {
        void devErr;
      }
      target.replaceChildren(...oldChildren);
      restoredOldChildren = true;
      throw err;
    } finally {
      restoreDomCommitScope(oldInstance);
    }

    host.finalizeReadSubscriptions(instance);
    instance.mounted = true;
    commitLifecycleForInstance(instance, wasFirstMount);
    flushLifecycleCommitBatch(lifecycleBatch);
  } catch (renderError) {
    discardCommitOperations(instance);
    cleanupRollbackChildren(renderer, target, oldChildren, restoredOldChildren);

    const rollbackErrors: unknown[] = [];
    try {
      incDevCounter('__DOM_REPLACE_COUNT');
      setDevValue(
        '__LAST_DOM_REPLACE_STACK_COMPONENT_ROLLBACK',
        new Error().stack
      );
      target.replaceChildren(...oldChildren);
    } catch (rollbackError) {
      rollbackErrors.push(rollbackError);
    }

    if (rollbackErrors.length > 0) {
      logger.error(
        '[Askr] component rollback failed after render error:',
        new AggregateError(rollbackErrors, 'Component rollback failed')
      );
    }

    throw renderError;
  }
}

function cleanupFailedCommitChildren(
  renderer: ReturnType<typeof getRuntimeRenderer>,
  target: Element,
  oldChildren: Node[]
): void {
  try {
    const newChildren = Array.from(target.childNodes);
    const preservedChildren = new Set(oldChildren);
    for (const node of newChildren) {
      if (preservedChildren.has(node)) {
        continue;
      }
      try {
        renderer.cleanupInstancesUnder(node);
      } catch (err) {
        logger.warn('[Askr] error cleaning up failed commit children:', err);
      }
    }
  } catch (err) {
    void err;
  }
}

function cleanupRollbackChildren(
  renderer: ReturnType<typeof getRuntimeRenderer>,
  target: Element,
  oldChildren: Node[],
  restoredOldChildren: boolean
): void {
  try {
    const currentChildren = Array.from(target.childNodes);
    const preservedChildren = restoredOldChildren ? new Set(oldChildren) : null;
    for (const node of currentChildren) {
      if (preservedChildren?.has(node)) {
        continue;
      }
      try {
        renderer.cleanupInstancesUnder(node);
      } catch (err) {
        logger.warn(
          '[Askr] error cleaning up partial children during rollback:',
          err
        );
      }
    }
  } catch (err) {
    void err;
  }
}
