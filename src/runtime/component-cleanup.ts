import { isDevelopmentEnvironment } from '../common/env';
import { logger } from '../common/logger';
import type { ComponentInstance } from './component-internal';
import {
  clearCurrentComponentScope,
  restoreCurrentComponentScope,
} from './component-scope';
import { cleanupReadableSubscriptionSources } from './readable';
import { untrackRouteGeneration } from './ownership-diagnostics';
import { warnUnusedStateReads } from './state-diagnostics';
import { getRuntimeRenderer } from './access';
import {
  disposeOwnership,
  ownChild,
  type OwnedChildScope,
  type OwnershipRecord,
} from './ownership';

declare const __ASKR_DEVELOPMENT_BUILD__: boolean;

export type { OwnedChildScope } from './ownership';

function disposeComponentOwnership(
  instance: ComponentInstance,
  owner: OwnershipRecord,
  active: boolean
): void {
  if (owner.disposed) return;
  const hadRendererHost = Boolean(instance.target || instance._placeholder);
  const savedScope = clearCurrentComponentScope();
  const errors: unknown[] | undefined = instance.cleanupStrict ? [] : undefined;
  try {
    if (active) {
      warnUnusedStateReads(instance);
      // Invalidate before user code can reenter disposal or schedule departed work.
      instance.lifecycleGeneration++;
      instance.evaluationGeneration++;
      instance.hasPendingUpdate = false;
      instance.notifyUpdate = null;
    }
    const detachReads = () =>
      cleanupReadableSubscriptionSources(instance, owner.reads, owner.identity);
    disposeOwnership(owner, {
      // An inactive route must detach first: its execution record already
      // represents another live route. Keep active cleanup ordering compatible.
      beforeCleanup: active ? undefined : detachReads,
      afterCleanup: active ? detachReads : undefined,
      recordError(message, error) {
        if (errors) errors.push(error);
        else if (isDevelopmentEnvironment()) logger.warn(message, error);
      },
    });
    if (active && instance.ownership === owner) {
      if (hadRendererHost) {
        getRuntimeRenderer().releaseComponentHost(instance);
      }
      instance.hasPendingUpdate = false;
      instance.notifyUpdate = null;
      instance.mountOperations = undefined;
      instance.commitOperations = undefined;
      instance.lifecycleSlots = undefined;
      instance._pendingReadSources = undefined;
      instance._pendingReadSourceVersions = undefined;
      instance._portalErrorParent = undefined;
      instance._portalErrorParentGeneration = undefined;
      instance._placeholder = undefined;
    }
    if (__ASKR_DEVELOPMENT_BUILD__) untrackRouteGeneration(owner.identity);
    if (errors?.length) {
      throw new AggregateError(
        errors,
        `Cleanup failed for component ${instance.id}`
      );
    }
  } finally {
    restoreCurrentComponentScope(savedScope);
  }
}

/** Retire an inactive lifetime without swapping it onto a live execution record. */
export function cleanupComponentGeneration(
  instance: ComponentInstance,
  owner: OwnershipRecord
): void {
  disposeComponentOwnership(instance, owner, false);
}

export function cleanupComponent(instance: ComponentInstance): void {
  disposeComponentOwnership(instance, instance.ownership, true);
}

export function registerOwnedChildScope(
  instance: ComponentInstance,
  scope: OwnedChildScope
): void {
  ownChild(instance.ownership, scope);
}

export function unregisterOwnedChildScope(
  instance: ComponentInstance,
  scope: OwnedChildScope
): void {
  instance.ownership.children?.delete(scope);
}
