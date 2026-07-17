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
import { cleanupReadableSubscriptions } from './readable';

export type OwnedChildScope = {
  key: string | number;
  dispose(): void;
};

/**
 * Clean up component resources on unmount or route changes.
 */
export function cleanupComponent(instance: ComponentInstance): void {
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
        instance.abortController.abort();
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
    instance._placeholder = undefined;
    instance.mounted = false;

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
