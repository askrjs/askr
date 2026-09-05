import { globalScheduler, type Scheduler } from './scheduler';
import type { RendererCapabilities } from './renderer-capabilities';
import { CommitCoordinator } from './transaction-coordinator';
import { logger } from '../common/logger';

function createMissingRendererHost(): RendererCapabilities {
  const missing = (method: string): never => {
    throw new Error(
      `[Askr] renderer host is not configured; cannot call ${method}().`
    );
  };

  return {
    captureComponentHost() {
      return undefined;
    },
    releaseComponentHost() {},
    detachPortalHostOutput() {},
    isComponentHostDetached() {
      return false;
    },
    clearChildScopeHost(scope) {
      // An unconfigured host can still receive opaque extension references.
      scope.dom = undefined;
      scope.range = undefined;
    },
    captureChildScopeHost() {
      return undefined;
    },
    resolveScopeBoundary() {
      return { dom: undefined, range: undefined };
    },
    prepareScopeRemoval() {
      return { dom: undefined, range: undefined };
    },
    recordRemovedScopeBoundary() {},
    teardownScopeHost() {
      return 0;
    },
    hasUnmountedComponentHost() {
      return false;
    },
    recordInlineComponentHost(instance, target) {
      instance.target = target;
    },
    applyComponentResult(instance) {
      if (instance.target || instance._placeholder)
        missing('applyComponentResult');
      return false;
    },
    classifyComponentUpdate() {
      return { useFastPath: false, reason: 'no-root' };
    },
    evaluate() {
      missing('evaluate');
    },
    cleanupInstancesUnder() {
      missing('cleanupInstancesUnder');
    },
    replaceComponentRange() {
      return missing('replaceComponentRange');
    },
    teardownNodeSubtree() {
      missing('teardownNodeSubtree');
    },
    populateKeyMapForElement() {
      // Fast-lane callers treat an empty key map as a normal decline.
    },
    getKeyMapForElement() {
      return undefined;
    },
    isKeyedReorderFastPathEligible() {
      return {
        useFastPath: false,
        totalKeyed: 0,
        totalChildren: 0,
        currentKeyCount: 0,
        moveCount: 0,
        lisLen: 0,
        hasPropChanges: false,
        isWholeKeyedList: false,
      };
    },
    markReactivePropsDirtySource() {
      // Reactive prop tracking is renderer-owned and optional for runtimes.
    },
  };
}

/** Internal wiring. Public runtime objects are views over these records. */
export interface RuntimeState {
  readonly scheduler: Scheduler;
  readonly commits: CommitCoordinator;
  renderer: RendererCapabilities;
}

export function createRuntimeState(
  scheduler: Scheduler = globalScheduler
): RuntimeState {
  return {
    scheduler,
    renderer: createMissingRendererHost(),
    commits: new CommitCoordinator({
      rollbackError(error) {
        logger.error('[Askr] transaction rollback failed:', error);
      },
      settlementErrors(errors) {
        logger.error(
          '[Askr] committed lifecycle work failed:',
          new AggregateError(errors, 'Committed lifecycle work failed')
        );
      },
    }),
  };
}

export const defaultRuntimeState = createRuntimeState();
