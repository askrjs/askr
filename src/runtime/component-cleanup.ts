/**
 * Component cleanup and owned child-scope bookkeeping.
 */

import { isDevelopmentEnvironment } from '../common/env';
import { logger } from '../common/logger';
import type { ComponentInstance } from './component-internal';
import {
  clearCurrentComponentScope,
  restoreCurrentComponentScope,
} from './component-scope';
import {
  cleanupReadableSubscriptions,
  cleanupReadableSubscriptionSources,
  type ReadableSource,
} from './readable';
import { untrackRouteGeneration } from './ownership-diagnostics';
import { warnUnusedStateReads } from './state-diagnostics';

declare const __ASKR_DEVELOPMENT_BUILD__: boolean;

// AbortController.abort() creates a new DOMException and captures the active
// teardown stack when no reason is supplied. Capture the platform's default
// reason once outside component execution so retained signals cannot keep
// departed component generations alive.
const COMPONENT_DISPOSED_REASON = (() => {
  const controller = new AbortController();
  controller.abort();
  return controller.signal.reason;
})();

export type OwnedChildScope = {
  key: string | number;
  dispose(): void;
};

export type ComponentGenerationCleanup = {
  ownershipGeneration: object;
  cleanupFns: ComponentInstance['cleanupFns'];
  ownedChildScopes: ComponentInstance['_ownedChildScopes'];
  abortController: AbortController | null;
  readSources: Set<ReadableSource<unknown>> | undefined;
};

/**
 * Dispose an inactive ownership generation without swapping it back onto the
 * component instance that now represents a different live route.
 */
export function cleanupComponentGeneration(
  instance: ComponentInstance,
  generation: ComponentGenerationCleanup
): void {
  const savedScope = clearCurrentComponentScope();

  try {
    const cleanupErrors: unknown[] | undefined = instance.cleanupStrict
      ? []
      : undefined;
    const recordCleanupError = (message: string, err: unknown): void => {
      if (cleanupErrors) {
        cleanupErrors.push(err);
      } else if (isDevelopmentEnvironment()) {
        logger.warn(message, err);
      }
    };

    const ownedChildScopes = generation.ownedChildScopes;
    if (ownedChildScopes && ownedChildScopes.size > 0) {
      for (const scope of ownedChildScopes) {
        try {
          scope.dispose();
        } catch (err) {
          recordCleanupError('[Askr] child scope cleanup threw:', err);
        }
      }
      ownedChildScopes.clear();
    }

    // Detach the inactive read set before user cleanup runs. A cleanup that
    // updates departed state must not enqueue work onto the live generation.
    try {
      cleanupReadableSubscriptionSources(
        instance,
        generation.readSources,
        generation.ownershipGeneration
      );
    } catch (err) {
      recordCleanupError('[Askr] readable subscription cleanup threw:', err);
    }

    const cleanupFns = generation.cleanupFns;
    generation.cleanupFns = undefined;
    if (cleanupFns) {
      for (const cleanup of cleanupFns) {
        try {
          cleanup();
        } catch (err) {
          recordCleanupError('[Askr] cleanup function threw:', err);
        }
      }
    }

    try {
      if (
        generation.abortController &&
        !generation.abortController.signal.aborted
      ) {
        generation.abortController.abort(COMPONENT_DISPOSED_REASON);
      }
    } catch (err) {
      recordCleanupError('[Askr] abort controller cleanup threw:', err);
    }
    generation.abortController = null;

    if (__ASKR_DEVELOPMENT_BUILD__) {
      untrackRouteGeneration(generation.ownershipGeneration);
    }

    if (cleanupErrors && cleanupErrors.length > 0) {
      throw new AggregateError(
        cleanupErrors,
        `Cleanup failed for component ${instance.id}`
      );
    }
  } finally {
    restoreCurrentComponentScope(savedScope);
  }
}

/**
 * Clean up component resources on unmount or route changes.
 */
export function cleanupComponent(instance: ComponentInstance): void {
  const savedScope = clearCurrentComponentScope();

  try {
    warnUnusedStateReads(instance);

    const cleanupErrors: unknown[] | undefined = instance.cleanupStrict
      ? []
      : undefined;
    const recordCleanupError = (message: string, err: unknown): void => {
      if (cleanupErrors) {
        cleanupErrors.push(err);
      } else if (isDevelopmentEnvironment()) {
        logger.warn(message, err);
      }
    };

    const ownedChildScopes = instance._ownedChildScopes;
    if (ownedChildScopes && ownedChildScopes.size > 0) {
      instance._ownedChildScopes = new Set();
      for (const scope of ownedChildScopes) {
        try {
          scope.dispose();
        } catch (err) {
          recordCleanupError('[Askr] child scope cleanup threw:', err);
        }
      }
    }

    const cleanupFns = instance.cleanupFns;
    instance.cleanupFns = undefined;
    if (cleanupFns) {
      for (const cleanup of cleanupFns) {
        try {
          cleanup();
        } catch (err) {
          recordCleanupError('[Askr] cleanup function threw:', err);
        }
      }
    }

    try {
      cleanupReadableSubscriptions(instance);
    } catch (err) {
      recordCleanupError('[Askr] readable subscription cleanup threw:', err);
    }

    try {
      if (
        instance.abortController &&
        !instance.abortController.signal.aborted
      ) {
        instance.abortController.abort(COMPONENT_DISPOSED_REASON);
      }
    } catch (err) {
      recordCleanupError('[Askr] abort controller cleanup threw:', err);
    }
    instance.abortController = null;

    instance.lifecycleGeneration++;
    instance.evaluationGeneration++;
    instance.mountOperations = undefined;
    instance.commitOperations = undefined;
    instance.lifecycleSlots = undefined;
    instance.hasPendingUpdate = false;
    instance.notifyUpdate = null;
    instance._portalErrorParent = undefined;
    instance._portalErrorParentGeneration = undefined;
    instance._placeholder = undefined;
    instance.mounted = false;

    if (__ASKR_DEVELOPMENT_BUILD__) {
      untrackRouteGeneration(instance._ownershipGeneration);
    }

    if (cleanupErrors && cleanupErrors.length > 0) {
      throw new AggregateError(
        cleanupErrors,
        `Cleanup failed for component ${instance.id}`
      );
    }
  } finally {
    restoreCurrentComponentScope(savedScope);
  }
}

export function registerOwnedChildScope(
  instance: ComponentInstance,
  scope: OwnedChildScope
): void {
  const scopes = (instance._ownedChildScopes ??= new Set());
  scopes.add(scope);
}

export function unregisterOwnedChildScope(
  instance: ComponentInstance,
  scope: OwnedChildScope
): void {
  instance._ownedChildScopes?.delete(scope);
}
