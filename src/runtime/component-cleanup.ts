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
  releaseOwnedChild,
  type OwnedChildScope,
  OwnershipRecord,
  type DisposalPhases,
} from './ownership';

declare const __ASKR_DEVELOPMENT_BUILD__: boolean;

export type { OwnedChildScope } from './ownership';

function componentDisposalPhases(owner: OwnershipRecord): DisposalPhases {
  const instance = owner.subject as ComponentInstance;
  const active = instance.ownership === owner;
  const hadRendererHost = Boolean(instance.target || instance._placeholder);
  const savedScope = clearCurrentComponentScope();
  const errors: unknown[] | undefined = instance.cleanupStrict ? [] : undefined;
  const detachReads = () =>
    cleanupReadableSubscriptionSources(instance, owner.reads, owner.identity);
  return {
    begin() {
      if (active) {
        instance.lifecycleGeneration++;
        instance.evaluationGeneration++;
        instance.hasPendingUpdate = false;
        instance.notifyUpdate = null;
        warnUnusedStateReads(instance);
      }
    },
    beforeCleanup: active ? undefined : detachReads,
    afterCleanup: active ? detachReads : undefined,
    recordError(message, error) {
      if (errors) errors.push(error);
      else if (isDevelopmentEnvironment()) logger.warn(message, error);
    },
    finish() {
      try {
        if (active && instance.ownership === owner) {
          try {
            if (hadRendererHost)
              getRuntimeRenderer().releaseComponentHost(instance);
          } catch (error) {
            if (errors) errors.push(error);
            else if (isDevelopmentEnvironment())
              logger.warn('[Askr] host release failed:', error);
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
        if (errors?.length)
          throw new AggregateError(
            errors,
            `Cleanup failed for component ${instance.id}`
          );
      } finally {
        restoreCurrentComponentScope(savedScope);
      }
    },
  };
}

export function createComponentOwnership(
  instance: ComponentInstance
): OwnershipRecord {
  const owner = new OwnershipRecord();
  owner.subject = instance;
  owner.lifecycle = componentDisposalPhases;
  return owner;
}

export function bindComponentOwnership(instance: ComponentInstance): void {
  instance.ownership.subject = instance;
  instance.ownership.lifecycle = componentDisposalPhases;
}

/** Retire the captured lifetime without swapping the execution record. */
export function cleanupComponentGeneration(
  _instance: ComponentInstance,
  owner: OwnershipRecord
): void {
  disposeOwnership(owner);
}

export function cleanupComponent(instance: ComponentInstance): void {
  disposeOwnership(instance.ownership);
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
  releaseOwnedChild(instance.ownership, scope);
}
