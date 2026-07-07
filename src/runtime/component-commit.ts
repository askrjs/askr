import { isDevelopmentEnvironment } from '../common/env';
import { isPromiseLike } from '../common/promise';
import { logger } from '../common/logger';
import { enqueueRuntimeTask, getRuntimeRenderer } from './access';
import {
  beginLifecycleCommitBatch,
  discardCommitOperations,
  discardLifecycleCommitBatch,
  executeCommittedLifecycleOperations,
  flushLifecycleCommitBatch,
} from './component-lifecycle';
import {
  beginRenderTracking,
  enterDomCommitScope,
  restoreDomCommitScope,
} from './component-scope';
import type { ContextFrame } from './context';
import { withContext } from './context';
import { incDevCounter, setDevValue } from './dev-namespace';
import { tryRuntimeFastLaneSync } from './fastlane';
import type { ComponentInstance } from './component-internal';

export interface ScheduledComponentCommitHost {
  execute(instance: ComponentInstance): unknown | Promise<unknown>;
  finalizeReadSubscriptions(instance: ComponentInstance): void;
  warnUnusedStateReads(instance: ComponentInstance): void;
  commitRenderedComponent(instance: ComponentInstance): void;
}

export function runScheduledComponent(
  instance: ComponentInstance,
  host: ScheduledComponentCommitHost
): void {
  instance.notifyUpdate = instance._enqueueRun!;
  beginRenderTracking(instance);
  const domSnapshot = instance.target ? instance.target.innerHTML : '';

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
      host.warnUnusedStateReads(instance);
      return;
    }
  } catch (err) {
    if (isDevelopmentEnvironment()) throw err;
  }

  enqueueRuntimeTask(() => {
    if (!instance.target && instance._placeholder) {
      commitPlaceholderReplacement(instance, result, host);
      return;
    }

    if (instance.target) {
      commitToTarget(instance, result, domSnapshot, host);
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
    host.warnUnusedStateReads(instance);
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
  const hostElement = document.createElement('div');
  const executionFrame: ContextFrame = {
    parent: instance.ownerFrame,
    values: null,
  };

  const oldInstance = enterDomCommitScope(instance);
  const lifecycleBatch = beginLifecycleCommitBatch();
  try {
    try {
      withContext(executionFrame, () => {
        renderer.evaluate(result, hostElement);
      });
      parent.replaceChild(hostElement, placeholder);
    } catch (err) {
      discardLifecycleCommitBatch(lifecycleBatch);
      throw err;
    }

    instance.target = hostElement;
    instance._placeholder = undefined;
    (
      hostElement as Element & {
        __ASKR_INSTANCE?: ComponentInstance;
      }
    ).__ASKR_INSTANCE = instance;

    flushLifecycleCommitBatch(lifecycleBatch);
    host.finalizeReadSubscriptions(instance);
    host.warnUnusedStateReads(instance);
    host.commitRenderedComponent(instance);
  } finally {
    restoreDomCommitScope(oldInstance);
  }
}

function commitToTarget(
  instance: ComponentInstance,
  result: unknown,
  domSnapshot: string,
  host: ScheduledComponentCommitHost
): void {
  const renderer = getRuntimeRenderer();
  const target = instance.target!;
  let oldChildren: Node[] = [];
  let restoredOldChildren = false;

  try {
    const wasFirstMount = !instance.mounted;
    const oldInstance = enterDomCommitScope(instance);
    const executionFrame: ContextFrame = {
      parent: instance.ownerFrame,
      values: null,
    };
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

    flushLifecycleCommitBatch(lifecycleBatch);
    host.finalizeReadSubscriptions(instance);
    host.warnUnusedStateReads(instance);
    instance.mounted = true;
    executeCommittedLifecycleOperations(instance, wasFirstMount);
  } catch (renderError) {
    discardCommitOperations(instance);
    cleanupRollbackChildren(renderer, target, oldChildren, restoredOldChildren);

    try {
      incDevCounter('__DOM_REPLACE_COUNT');
      setDevValue(
        '__LAST_DOM_REPLACE_STACK_COMPONENT_ROLLBACK',
        new Error().stack
      );
      target.replaceChildren(...oldChildren);
    } catch {
      target.innerHTML = domSnapshot;
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
