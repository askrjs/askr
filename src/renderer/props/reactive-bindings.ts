import { logger } from '../../common/logger';
import {
  createFineGrainedEffect,
  getCurrentCommitTransaction,
  markFineGrainedEffectsDirtySource,
  snapshotFineGrainedEffect,
  type FineGrainedEffectHandle,
} from '../../runtime';
import { registerCommitParticipant } from '../../runtime/transactions/access';
import { isBenchMetricScopeActive, recordBenchCounter } from '../../runtime';
import { incrementPerfMetric } from '../../runtime';
import type { ReadableSource } from '../../runtime';
import { applyScalarPropValue } from './attributes';
import {
  elementReactivePropsCleanup,
  getElementReactivePropsCleanupMap,
  type ReactivePropCleanupEntry,
} from '../ownership/cleanup';
import { getRuntimeEnv } from '../env';
import type { DOMElement } from '../types';
declare const __ASKR_BENCH_BUILD__: boolean;
const BENCH_BUILD_ENABLED = __ASKR_BENCH_BUILD__;

interface ReactivePropDescriptor {
  el: Element;
  propName: string;
  propFn: () => unknown;
  tagName: string;
  lastClassTokens: string[] | null;
  /** Last committed value; before the first commit, the seed baseline. */
  appliedValue: unknown;
  hasCommitted: boolean;
  effect: FineGrainedEffectHandle<unknown> | null;
}

const reactivePropRegistry = new Set<ReactivePropDescriptor>();
const BINDING_ROLLBACK = {};

/**
 * Enlist a binding in the open render transaction before it changes.
 *
 * Captured once per binding and transaction, so rollback returns the binding
 * to what the last successful commit left: its compute, dependencies, value
 * and DOM. Outside a transaction a binding update is its own commit.
 */
export function captureBindingRollback<K extends object>(
  key: K,
  snapshot: (key: K) => () => void
): void {
  const transaction = getCurrentCommitTransaction();
  if (transaction && !transaction.participant(key, BINDING_ROLLBACK))
    registerCommitParticipant({
      key,
      kind: BINDING_ROLLBACK,
      collision: 'keep-first',
      rollback: snapshot(key),
    });
}

function snapshotReactiveProp(descriptor: ReactivePropDescriptor): () => void {
  const restoreEffect = snapshotFineGrainedEffect(descriptor.effect!);
  const { propFn, appliedValue, hasCommitted, lastClassTokens } = descriptor;
  return () => {
    restoreEffect();
    descriptor.propFn = propFn;
    descriptor.appliedValue = appliedValue;
    descriptor.hasCommitted = hasCommitted;
    descriptor.lastClassTokens = lastClassTokens;
  };
}

export function markReactivePropsDirtySource(
  source: ReadableSource<unknown>
): void {
  markFineGrainedEffectsDirtySource(source);
}

function setupReactiveProp(
  el: Element,
  propName: string,
  propFn: () => unknown,
  tagName: string,
  seedValue: unknown
): {
  cleanup: () => void;
  updateFn: (nextFn: () => unknown) => void;
  readAppliedValue: () => unknown;
} {
  const descriptor: ReactivePropDescriptor = {
    el,
    propName,
    propFn,
    tagName,
    lastClassTokens: null,
    appliedValue: seedValue,
    hasCommitted: false,
    effect: null,
  };

  reactivePropRegistry.add(descriptor);
  descriptor.effect = createFineGrainedEffect({
    lane: 'reactive',
    compute: () => descriptor.propFn(),
    commit: (value, previousValue) => {
      incrementPerfMetric('reactivePropReevaluations');
      applyScalarPropValue(
        el,
        propName,
        value,
        tagName,
        descriptor.hasCommitted ? previousValue : descriptor.appliedValue,
        descriptor
      );
      descriptor.appliedValue = value;
      descriptor.hasCommitted = true;
    },
    equals: (previousValue, nextValue) => {
      if (Object.is(previousValue, nextValue)) {
        incrementPerfMetric('skippedDomPropWrites');
        return true;
      }
      return false;
    },
    onError: (err) => {
      if (getRuntimeEnv().NODE_ENV !== 'production') {
        logger.warn('[Askr] Reactive prop update failed:', err);
      }
    },
  });

  if (BENCH_BUILD_ENABLED && isBenchMetricScopeActive('coldCreate')) {
    recordBenchCounter('reactivePropsMounted');
  }

  const cleanup = () => {
    reactivePropRegistry.delete(descriptor);
    descriptor.effect?.cleanup();
    descriptor.effect = null;
  };

  const updateFn = (nextFn: () => unknown): void => {
    const effectHandle = descriptor.effect;
    if (!effectHandle || descriptor.propFn === nextFn) {
      return;
    }

    captureBindingRollback(descriptor, snapshotReactiveProp);
    descriptor.propFn = nextFn;

    try {
      effectHandle.updateCompute(nextFn);
    } catch (err) {
      if (getRuntimeEnv().NODE_ENV !== 'production') {
        logger.warn('[Askr] Reactive prop update failed:', err);
      }
    }
  };

  return {
    cleanup,
    updateFn,
    readAppliedValue: () =>
      descriptor.hasCommitted ? descriptor.appliedValue : undefined,
  };
}

/** @internal Create a standalone reactive prop entry for rollback restoration. */
export function createReactivePropCleanupEntry(
  el: Element,
  propName: string,
  propFn: () => unknown,
  tagName: string,
  seedValue?: unknown
): ReactivePropCleanupEntry {
  const reactive = setupReactiveProp(el, propName, propFn, tagName, seedValue);

  return {
    cleanup: reactive.cleanup,
    readAppliedValue: reactive.readAppliedValue,
    updateFn: (nextValue) => {
      reactive.updateFn(nextValue as () => unknown);
    },
    restoreFn: (nextValue) =>
      createReactivePropCleanupEntry(
        el,
        propName,
        nextValue as () => unknown,
        tagName
      ),
    fnRef: propFn,
  };
}

export function getOrCreateReactivePropsCleanupMap(
  el: Element
): Map<string, ReactivePropCleanupEntry> {
  return getElementReactivePropsCleanupMap(el, true)!;
}

/** Retire a binding before its prop becomes a scalar or is removed. */
export function removeReactivePropBinding(
  entries: Map<string, ReactivePropCleanupEntry> | undefined,
  key: string
): boolean {
  const entry = entries?.get(key);
  if (!entry) return false;
  entry.cleanup();
  entries?.delete(key);
  return true;
}

/** Reuse a binding's effect identity when replacing its compute function. */
export function syncReactivePropBinding(
  el: Element,
  key: string,
  value: () => unknown,
  vnode: Pick<DOMElement, 'type'>,
  existingEntry: ReactivePropCleanupEntry | undefined,
  seedValue?: unknown
): void {
  if (existingEntry && existingEntry.fnRef === value) return;
  if (existingEntry?.updateFn) {
    existingEntry.updateFn(value);
    existingEntry.fnRef = value;
    return;
  }
  if (existingEntry) existingEntry.cleanup();
  getOrCreateReactivePropsCleanupMap(el).set(
    key,
    createReactivePropCleanupEntry(
      el,
      key,
      value,
      vnode.type as string,
      seedValue
    )
  );
}

/** Prune reactive bindings only after listener reconciliation completes. */
export function pruneReactivePropBindings(
  el: Element,
  existingReactiveProps: Map<string, ReactivePropCleanupEntry> | undefined,
  desiredReactivePropNames: Set<string> | null
): void {
  if (existingReactiveProps && existingReactiveProps.size > 0) {
    if (desiredReactivePropNames === null) {
      existingReactiveProps.forEach((entry) => {
        entry.cleanup();
      });
      elementReactivePropsCleanup.delete(el);
    } else {
      existingReactiveProps.forEach((entry, key) => {
        if (!desiredReactivePropNames.has(key)) {
          entry.cleanup();
          existingReactiveProps.delete(key);
        }
      });
      if (existingReactiveProps.size === 0) {
        elementReactivePropsCleanup.delete(el);
      }
    }
  }
}
