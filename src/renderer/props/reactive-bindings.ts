import {
  createFineGrainedEffect,
  getCurrentCommitTransaction,
  getCurrentComponentInstance,
  isRenderingProtectedBoundaryContent,
  routeRenderedOutputErrorToBoundary,
  markFineGrainedEffectsDirtySource,
  restoreFineGrainedEffect,
  saveFineGrainedEffect,
  type FineGrainedEffectHandle,
} from '../../runtime';
import {
  registerCommitParticipant,
  type CommitParticipant,
} from '../../runtime/transactions/access';
import { isBenchMetricScopeActive, recordBenchCounter } from '../../runtime';
import { incrementPerfMetric } from '../../runtime';
import type { ReadableSource } from '../../runtime';
import { applyScalarPropValue } from './attributes';
import {
  elementReactivePropsCleanup,
  getElementReactivePropsCleanupMap,
  type ReactivePropCleanupEntry,
} from '../ownership/cleanup';
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
const BINDING_LOG = {};

/** Entries are `[restore, ...state]` blocks starting at `starts`. */
interface BindingLog extends CommitParticipant {
  keys: Set<object>;
  entries: unknown[];
  starts: number[];
}

type RestoreBinding = (entries: unknown[], index: number) => void;

function rollbackBindingLog(this: BindingLog): void {
  const { entries, starts } = this;
  // Newest first, so a joined child's later state yields to the parent's.
  for (let block = starts.length - 1; block >= 0; block--) {
    const start = starts[block]!;
    (entries[start] as RestoreBinding)(entries, start + 1);
  }
}

function mergeBindingLog(this: BindingLog, parent: CommitParticipant): void {
  const log = parent as BindingLog;
  const offset = log.entries.length;
  for (const start of this.starts) log.starts.push(start + offset);
  for (const entry of this.entries) log.entries.push(entry);
  for (const key of this.keys) log.keys.add(key);
}

/**
 * Record a binding's state before its first change in the open render
 * transaction. One log per transaction holds every binding, so a successful
 * render pays for flat entries, not per-binding participants or closures.
 * Outside a transaction a binding update is its own commit.
 */
export function captureBindingRollback<K extends object>(
  key: K,
  save: (key: K, entries: unknown[]) => void
): void {
  const transaction = getCurrentCommitTransaction();
  if (!transaction) return;
  let log = transaction.participant<BindingLog>(BINDING_LOG, BINDING_LOG);
  if (!log) {
    log = {
      key: BINDING_LOG,
      kind: BINDING_LOG,
      keys: new Set(),
      entries: [],
      starts: [],
      rollback: rollbackBindingLog,
      merge: mergeBindingLog,
    };
    registerCommitParticipant(log);
  }
  if (log.keys.has(key)) return;
  log.keys.add(key);
  log.starts.push(log.entries.length);
  save(key, log.entries);
}

function saveReactiveProp(
  descriptor: ReactivePropDescriptor,
  entries: unknown[]
): void {
  entries.push(
    restoreReactiveProp,
    descriptor,
    descriptor.propFn,
    descriptor.appliedValue,
    descriptor.hasCommitted,
    descriptor.lastClassTokens
  );
  saveFineGrainedEffect(entries, descriptor.effect!);
}

function restoreReactiveProp(entries: unknown[], index: number): void {
  const descriptor = entries[index] as ReactivePropDescriptor;
  descriptor.propFn = entries[index + 1] as () => unknown;
  descriptor.appliedValue = entries[index + 2];
  descriptor.hasCommitted = entries[index + 3] as boolean;
  descriptor.lastClassTokens = entries[index + 4] as string[] | null;
  restoreFineGrainedEffect(entries, index + 5);
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

  // Binding failures belong to the component that rendered the binding. An
  // ErrorBoundary's own children are protected by it; its fallback is not.
  const owner = getCurrentComponentInstance();
  const protectedByOwner =
    !!owner && isRenderingProtectedBoundaryContent(owner);

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
      if (
        !owner ||
        !routeRenderedOutputErrorToBoundary(owner, err, protectedByOwner)
      ) {
        throw err;
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
    if (!effectHandle) {
      return;
    }

    captureBindingRollback(descriptor, saveReactiveProp);
    descriptor.propFn = nextFn;
    effectHandle.updateCompute(nextFn);
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
