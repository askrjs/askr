import { captureGenerationExecution } from './state';
import type { ComponentInstance } from './instance';
import {
  cleanupComponent,
  cleanupComponentGeneration,
  createComponentOwnership,
} from './cleanup';
import { cleanupReadableSubscriptionSources } from '../reactivity/readable';
import {
  adjustOwnershipDiagnostic,
  trackRouteGeneration,
} from '../diagnostics/ownership-diagnostics';
import { getRuntimeCleanup } from '../access';
import { attachOwnership } from '../ownership/record';
import { resetComponentWork } from './reset';

declare const __ASKR_DEVELOPMENT_BUILD__: boolean;

export interface PreparedComponentGeneration {
  prepare(fn: ComponentInstance['fn'], props: ComponentInstance['props']): void;
  rollback(restoreHost: () => unknown[]): unknown[];
  retire(): void;
}

/** Reuse an execution record after boot has retired its previous lifetime. */
export function restartComponentGeneration(
  instance: ComponentInstance,
  fn: ComponentInstance['fn'],
  preserveState: boolean
): void {
  instance.owner = createComponentOwnership(instance);
  instance.fn = fn;
  instance.evaluationGeneration++;
  instance.expectedStateIndices = [];
  instance.firstRenderComplete = false;
  if (!preserveState) {
    resetComponentWork(instance);
    instance.stateValues = [];
    instance.stateIndexCheck = -1;
    instance._currentRenderToken = undefined;
    instance.lastRenderToken = 0;
    instance.errorBoundaryState = undefined;
    instance._portalErrorParent = undefined;
    instance._portalErrorParentGeneration = undefined;
    instance.devWarningsEmitted = undefined;
  }
}

/** Runtime-owned preparation and retirement. A host may restore its own state
 * between disposing provisional work and restoring the previous execution. */
export function captureComponentGeneration(
  instance: ComponentInstance
): PreparedComponentGeneration {
  const restoreHostIndex = getRuntimeCleanup().captureComponentHost(instance);
  const snapshot = captureGenerationExecution(instance);
  const reads = instance.owner.reads;
  const readerEntries = Array.from(reads ?? [], (source) => ({
    source,
    reader: source._readers?.get(instance),
  }));
  let settled = false;
  return {
    prepare(fn, props) {
      if (settled || instance.owner !== snapshot.owner) {
        throw new Error(
          '[Askr] component generation is no longer available for preparation'
        );
      }
      const owner = createComponentOwnership(instance);
      owner.mounted = snapshot.owner.mounted;
      instance.owner = owner;
      attachOwnership(owner, snapshot.owner.parent);
      instance.fn = fn;
      instance.props = props;
      resetComponentWork(instance);
      instance.stateValues = [];
      instance.expectedStateIndices = [];
      instance.firstRenderComplete = false;
      instance.stateIndexCheck = -1;
      instance.evaluationGeneration++;
      instance.lifecycleGeneration++;
      instance.mountOperations = [];
      instance.commitOperations = [];
      instance.lifecycleSlots = [];
      instance._currentRenderToken = undefined;
      instance.lastRenderToken = 0;
      if (__ASKR_DEVELOPMENT_BUILD__) trackRouteGeneration(owner.identity);
    },
    rollback(restoreHost) {
      if (settled) return [];
      settled = true;
      const errors: unknown[] = [];
      const provisional = instance.owner;
      if (provisional !== snapshot.owner) {
        try {
          cleanupReadableSubscriptionSources(
            instance,
            provisional.reads,
            provisional.identity
          );
        } catch (error) {
          errors.push(error);
        }
        provisional.reads = undefined;
        try {
          cleanupComponent(instance);
        } catch (error) {
          errors.push(error);
        }
      }
      try {
        errors.push(...restoreHost());
      } catch (error) {
        errors.push(error);
      }
      Object.assign(instance, snapshot);
      try {
        restoreHostIndex?.();
      } catch (error) {
        errors.push(error);
      }
      snapshot.owner.reads = reads;
      for (const { source, reader } of readerEntries) {
        if (!reader) {
          if (source._readers?.delete(instance) && __ASKR_DEVELOPMENT_BUILD__) {
            adjustOwnershipDiagnostic('readableReaders', -1);
          }
          continue;
        }
        const readers = (source._readers ??= new Map());
        const hadReader = readers.has(instance);
        readers.set(instance, reader);
        if (!hadReader && __ASKR_DEVELOPMENT_BUILD__)
          adjustOwnershipDiagnostic('readableReaders', 1);
      }
      return errors;
    },
    retire() {
      if (settled) return;
      settled = true;
      cleanupComponentGeneration(instance, snapshot.owner);
    },
  };
}
