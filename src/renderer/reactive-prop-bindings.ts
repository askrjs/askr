import { logger } from '../common/logger';
import {
  createFineGrainedEffect,
  markFineGrainedEffectsDirtySource,
  type FineGrainedEffectHandle,
} from '../runtime';
import { isBenchMetricScopeActive, recordBenchCounter } from '../runtime';
import { incrementPerfMetric } from '../runtime';
import type { ReadableSource } from '../runtime';
import { applyScalarPropValue } from './attributes';
import { type ReactivePropCleanupEntry } from './cleanup';
import { getRuntimeEnv } from './env';
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
