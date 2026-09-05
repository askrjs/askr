import type { ComponentInstance } from './component-internal';
import {
  cleanupComponent,
  cleanupComponentGeneration,
} from './component-cleanup';
import { cleanupReadableSubscriptionSources } from './readable';
import {
  adjustOwnershipDiagnostic,
  trackRouteGeneration,
} from './ownership-diagnostics';
import { OwnershipRecord } from './ownership';

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
  instance.ownership = new OwnershipRecord();
  instance.fn = fn;
  instance.evaluationGeneration++;
  instance.expectedStateIndices = [];
  instance.firstRenderComplete = false;
  if (!preserveState) {
    instance.stateValues = [];
    instance.stateIndexCheck = -1;
    instance.hasPendingUpdate = false;
    instance.notifyUpdate = null;
    instance.mountOperations = undefined;
    instance.commitOperations = undefined;
    instance.lifecycleSlots = undefined;
    instance._currentRenderToken = undefined;
    instance.lastRenderToken = 0;
    instance._pendingReadSources = undefined;
    instance._pendingReadSourceVersions = undefined;
    instance._placeholder = undefined;
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
  const snapshot = {
    ownership: instance.ownership,
    fn: instance.fn,
    props: instance.props,
    expectedStateIndices: instance.expectedStateIndices,
    firstRenderComplete: instance.firstRenderComplete,
    stateIndexCheck: instance.stateIndexCheck,
    errorBoundaryState: instance.errorBoundaryState,
    target: instance.target,
    stateValues: instance.stateValues,
    mountOperations: instance.mountOperations,
    commitOperations: instance.commitOperations,
    lifecycleSlots: instance.lifecycleSlots,
    lifecycleGeneration: instance.lifecycleGeneration,
    evaluationGeneration: instance.evaluationGeneration,
    hasPendingUpdate: instance.hasPendingUpdate,
    notifyUpdate: instance.notifyUpdate,
    _placeholder: instance._placeholder,
    _currentRenderToken: instance._currentRenderToken,
    lastRenderToken: instance.lastRenderToken,
    _pendingReadSources: instance._pendingReadSources,
    _pendingReadSourceVersions: instance._pendingReadSourceVersions,
    _appRenderRuntime: instance._appRenderRuntime,
  };
  const reads = instance.ownership.reads;
  const readerEntries = Array.from(reads ?? [], (source) => ({
    source,
    reader: source._readers?.get(instance),
  }));
  let settled = false;
  return {
    prepare(fn, props) {
      if (settled || instance.ownership !== snapshot.ownership) {
        throw new Error(
          '[Askr] component generation is no longer available for preparation'
        );
      }
      const owner = new OwnershipRecord();
      owner.mounted = snapshot.ownership.mounted;
      instance.ownership = owner;
      instance.fn = fn;
      instance.props = props;
      instance.stateValues = [];
      instance.expectedStateIndices = [];
      instance.firstRenderComplete = false;
      instance.stateIndexCheck = -1;
      instance.evaluationGeneration++;
      instance.lifecycleGeneration++;
      instance.notifyUpdate = null;
      instance.mountOperations = [];
      instance.commitOperations = [];
      instance.lifecycleSlots = [];
      instance._placeholder = undefined;
      instance.hasPendingUpdate = false;
      instance._currentRenderToken = undefined;
      instance.lastRenderToken = 0;
      instance._pendingReadSources = undefined;
      instance._pendingReadSourceVersions = undefined;
      if (__ASKR_DEVELOPMENT_BUILD__) trackRouteGeneration(owner.identity);
    },
    rollback(restoreHost) {
      if (settled) return [];
      settled = true;
      const errors: unknown[] = [];
      const provisional = instance.ownership;
      if (provisional !== snapshot.ownership) {
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
      snapshot.ownership.reads = reads;
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
      cleanupComponentGeneration(instance, snapshot.ownership);
    },
  };
}
