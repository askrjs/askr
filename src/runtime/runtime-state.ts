import { globalScheduler, type Scheduler } from './scheduler';
import type { RendererCapabilities } from './renderer-capabilities';
import { CommitCoordinator } from './transactions/coordinator';
import { logger } from '../common/logger';

/**
 * The renderer host for an environment that has no DOM renderer.
 *
 * This is not only a pre-boot placeholder: SSR and SSG never install a renderer,
 * so it is the live host for the whole life of every server render. It
 * therefore has to be usable, not merely loud, and it follows one rule:
 *
 * - Bookkeeping degrades. Capturing, releasing and inspecting hosts, scopes and
 *   key maps answer as though nothing is mounted, because during a server
 *   render nothing is.
 * - Anything that would produce or destroy DOM throws. Reaching `evaluate`,
 *   `replaceComponentRange` or a teardown without a renderer means execution
 *   believed it had one, which is a bug worth surfacing rather than silently
 *   dropping the output.
 *
 * Browser composition replaces this through `installRuntimeRenderer`.
 */
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
      // Only a mounted instance could have had a result applied; an unmounted
      // one legitimately has nothing to apply.
      if (instance.target || instance._placeholder) {
        return missing('applyComponentResult');
      }
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
