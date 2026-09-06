import { globalScheduler, type Scheduler } from './scheduler';
import type { RendererCapabilities } from './renderer-capabilities';
import { CommitCoordinator } from './transactions/coordinator';
import { logger } from '../common/logger';

function createMissingRendererHost(): RendererCapabilities {
  const noop = () => undefined;
  const missing = (method: string): never => {
    throw new Error(
      `[Askr] renderer host is not configured; cannot call ${method}().`
    );
  };

  return {
    captureComponentHost: noop,
    releaseComponentHost: noop,
    detachPortalHostOutput: noop,
    isComponentHostDetached() {
      return false;
    },
    clearChildScopeHost(scope) {
      // An unconfigured host can still receive opaque extension references.
      scope.dom = undefined;
      scope.range = undefined;
    },
    captureChildScopeHost: noop,
    resolveScopeBoundary() {
      return { dom: undefined, range: undefined };
    },
    prepareScopeRemoval() {
      return { dom: undefined, range: undefined };
    },
    recordRemovedScopeBoundary: noop,
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
    // An empty key map is a normal decline; reactive tracking is optional.
    populateKeyMapForElement: noop,
    getKeyMapForElement: noop,
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
    markReactivePropsDirtySource: noop,
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
