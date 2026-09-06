import { isDevelopmentEnvironment } from '../../common/env';
import { logger } from '../../common/logger';
import type { ComponentInstance } from './instance';
import {
  clearCurrentComponentScope,
  restoreCurrentComponentScope,
} from './scope';
import { cleanupReadableSubscriptionSources } from '../reactivity/readable';
import { untrackRouteGeneration } from '../diagnostics/ownership-diagnostics';
import { warnUnusedStateReads } from '../diagnostics/state-diagnostics';
import { getRuntimeCleanup } from '../access';
import { resetComponentWork } from './reset';
import {
  disposeOwnership,
  ownChild,
  releaseOwnedChild,
  type OwnedChildScope,
  OwnershipRecord,
  type DisposalPhases,
} from '../ownership/record';

declare const __ASKR_DEVELOPMENT_BUILD__: boolean;

export type { OwnedChildScope } from '../ownership/record';

function componentDisposalPhases(owner: OwnershipRecord): DisposalPhases {
  const instance = owner.subject as ComponentInstance;
  const active = instance.owner === owner;
  const hadRendererHost = Boolean(instance.target || instance._placeholder);
  const savedScope = clearCurrentComponentScope();
  const errors: unknown[] | undefined = instance.cleanupStrict ? [] : undefined;
  const retiredScopes = active ? undefined : owner.scopedIndex;
  const detachReads = () => {
    retiredScopes?.clear();
    cleanupReadableSubscriptionSources(instance, owner.reads, owner.identity);
  };
  const recordError = (message: string, error: unknown) => {
    if (errors) errors.push(error);
    else if (isDevelopmentEnvironment()) logger.warn(message, error);
  };
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
    recordError,
    finish() {
      try {
        if (active && instance.owner === owner) {
          try {
            if (hadRendererHost)
              getRuntimeCleanup().releaseComponentHost(instance);
          } catch (error) {
            recordError('[Askr] host release failed:', error);
          }
          resetComponentWork(instance);
          instance._portalErrorParent = undefined;
          instance._portalErrorParentGeneration = undefined;
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
  instance.owner.subject = instance;
  instance.owner.lifecycle = componentDisposalPhases;
}

/** Retire the captured lifetime without swapping the execution record. */
export function cleanupComponentGeneration(
  _instance: ComponentInstance,
  owner: OwnershipRecord
): void {
  disposeOwnership(owner);
}

export function cleanupComponent(instance: ComponentInstance): void {
  disposeOwnership(instance.owner);
}

export function registerOwnedChildScope(
  instance: ComponentInstance,
  scope: OwnedChildScope
): void {
  ownChild(instance.owner, scope);
}

export function unregisterOwnedChildScope(
  instance: ComponentInstance,
  scope: OwnedChildScope
): void {
  releaseOwnedChild(instance.owner, scope);
}
