import { logger } from '../../common/logger';
import {
  createFineGrainedEffect,
  markFineGrainedEffectsDirtySource,
  type FineGrainedEffectHandle,
} from '../../runtime';
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
}

const reactivePropRegistry = new Set<ReactivePropDescriptor>();

export function markReactivePropsDirtySource(
  source: ReadableSource<unknown>
): void {
  markFineGrainedEffectsDirtySource(source);
}

function setupReactiveProp(
  el: Element,
  propName: string,
  propFn: () => unknown,
  tagName: string
): { cleanup: () => void; updateFn: (nextFn: () => unknown) => void } {
  const descriptor: ReactivePropDescriptor = {
    el,
    propName,
    propFn,
    tagName,
    lastClassTokens: null,
  };

  let effectHandle: FineGrainedEffectHandle<unknown> | null = null;

  reactivePropRegistry.add(descriptor);
  effectHandle = createFineGrainedEffect({
    lane: 'reactive',
    compute: () => descriptor.propFn(),
    commit: (value, previousValue) => {
      incrementPerfMetric('reactivePropReevaluations');
      applyScalarPropValue(
        el,
        propName,
        value,
        tagName,
        previousValue,
        descriptor
      );
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
    effectHandle?.cleanup();
    effectHandle = null;
  };

  const updateFn = (nextFn: () => unknown): void => {
    if (!effectHandle) {
      return;
    }

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
  };
}

/** @internal Create a standalone reactive prop entry for rollback restoration. */
export function createReactivePropCleanupEntry(
  el: Element,
  propName: string,
  propFn: () => unknown,
  tagName: string
): ReactivePropCleanupEntry {
  const reactive = setupReactiveProp(el, propName, propFn, tagName);

  return {
    cleanup: reactive.cleanup,
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
  existingEntry: ReactivePropCleanupEntry | undefined
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
    createReactivePropCleanupEntry(el, key, value, vnode.type as string)
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
