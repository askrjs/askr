import { globalScheduler, type Scheduler } from './scheduler';
import type { RendererCapabilities } from './renderer-capabilities';

function createMissingRendererHost(): RendererCapabilities {
  const missing = (method: string): never => {
    throw new Error(
      `[Askr] renderer host is not configured; cannot call ${method}().`
    );
  };

  return {
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
  renderer: RendererCapabilities;
}

export function createRuntimeState(
  scheduler: Scheduler = globalScheduler
): RuntimeState {
  return { scheduler, renderer: createMissingRendererHost() };
}

export const defaultRuntimeState = createRuntimeState();
