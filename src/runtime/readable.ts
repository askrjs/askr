import {
  enqueueRuntimeTask,
  isRuntimeSchedulerExecuting,
  markRuntimeReactivePropsDirtySource,
} from './access';
import { getCurrentInstance } from './component-scope';
import type { ComponentInstance } from './component-internal';
import { adjustOwnershipDiagnostic } from './ownership-diagnostics';

declare const __ASKR_DEVELOPMENT_BUILD__: boolean;

const DEVELOPMENT_BUILD_ENABLED = __ASKR_DEVELOPMENT_BUILD__;

export interface DerivedSubscriber {
  _markDirty(): void;
  _pendingDependencySources?: Set<ReadableSource<unknown>>;
}

export interface ReadableSource<T = unknown> {
  (): T;
  _hasBeenRead?: boolean;
  _hasEverBeenRead?: boolean;
  _unusedStateDiagnosticEligible?: boolean;
  _readers?: Map<ComponentInstance, { token: number; generation: object }>;
  _derivedSubscribers?: Set<DerivedSubscriber>;
  _version?: number;
}

export interface FineGrainedReadCollector {
  _pendingFineGrainedReadSource: ReadableSource<unknown> | null;
  _pendingFineGrainedReadSources:
    | ReadableSource<unknown>
    | ReadableSource<unknown>[]
    | Set<ReadableSource<unknown>>
    | null;
}

export function markReadableUsage(source: unknown): void {
  if (
    source &&
    typeof source === 'function' &&
    ('_hasBeenRead' in source || '_readers' in source)
  ) {
    const readable = source as ReadableSource<unknown>;
    readable._hasBeenRead = true;
    if (readable._unusedStateDiagnosticEligible === true) {
      readable._hasEverBeenRead = true;
    }
  }
}

let currentDerivedSubscriber: DerivedSubscriber | null = null;
let suppressComponentReadTrackingDepth = 0;
let currentFineGrainedReadCollector: FineGrainedReadCollector | null = null;

function scheduleReadableInstanceUpdate(instance: ComponentInstance): void {
  if (instance.ownership.disposed || instance.hasPendingUpdate) {
    return;
  }

  instance.hasPendingUpdate = true;
  const task = instance._pendingFlushTask;
  if (task) {
    enqueueRuntimeTask(task);
    return;
  }

  enqueueRuntimeTask(() => {
    instance.hasPendingUpdate = false;
    instance.notifyUpdate?.();
  });
}

export function recordReadableRead(source: ReadableSource<unknown>): void {
  if (source._unusedStateDiagnosticEligible === true) {
    source._hasEverBeenRead = true;
  }

  if (currentFineGrainedReadCollector) {
    const first = currentFineGrainedReadCollector._pendingFineGrainedReadSource;
    if (!first) {
      currentFineGrainedReadCollector._pendingFineGrainedReadSource = source;
    } else if (first !== source) {
      let sources =
        currentFineGrainedReadCollector._pendingFineGrainedReadSources;
      if (!sources) {
        currentFineGrainedReadCollector._pendingFineGrainedReadSources = source;
      } else if (Array.isArray(sources)) {
        if (!sources.includes(source)) {
          sources.push(source);
        }
      } else if (sources instanceof Set) {
        sources.add(source);
      } else if (sources !== source) {
        currentFineGrainedReadCollector._pendingFineGrainedReadSources = [
          first,
          sources,
          source,
        ];
      }
    }
    return;
  }

  if (currentDerivedSubscriber) {
    if (!currentDerivedSubscriber._pendingDependencySources) {
      currentDerivedSubscriber._pendingDependencySources = new Set();
    }
    currentDerivedSubscriber._pendingDependencySources.add(source);
  }

  if (suppressComponentReadTrackingDepth > 0) {
    return;
  }

  const inst = getCurrentInstance();
  if (!inst || inst._currentRenderToken === undefined) {
    return;
  }

  if (!inst._pendingReadSources) {
    inst._pendingReadSources = new Set();
  }
  inst._pendingReadSources.add(source);

  const sourceVersion = source._version ?? 0;
  let pendingVersions = inst._pendingReadSourceVersions;
  if (!pendingVersions) {
    pendingVersions = new Map();
    inst._pendingReadSourceVersions = pendingVersions;
  }
  pendingVersions.set(source, sourceVersion);
}

export function withFineGrainedReadTracking<T>(
  collector: FineGrainedReadCollector,
  fn: () => T
): T {
  const previousCollector = currentFineGrainedReadCollector;
  currentFineGrainedReadCollector = collector;

  try {
    return fn.call(collector);
  } finally {
    currentFineGrainedReadCollector = previousCollector;
  }
}

/** @internal Whether the active grouped effect coalesces item-property reads. */
export function shouldCoalesceFineGrainedItemReads(): boolean {
  const owner = (
    currentFineGrainedReadCollector as {
      _owner?: { _coalesceForItemReads?: boolean };
    } | null
  )?._owner;
  return owner?._coalesceForItemReads === true;
}

export function finalizeReadableSubscriptionsFromSnapshot(
  instance: ComponentInstance,
  token: number | undefined,
  newSet: Set<ReadableSource<unknown>> | undefined,
  pendingReadSourceVersions:
    | Map<ReadableSource<unknown>, number>
    | undefined = instance._pendingReadSourceVersions,
  ownershipGeneration: object = instance.ownership.identity
): void {
  if (
    instance.ownership.disposed ||
    token === undefined ||
    instance.ownership.identity !== ownershipGeneration ||
    (!instance.ownership.mounted && instance.notifyUpdate === null)
  ) {
    return;
  }

  const oldSet = instance.ownership.reads;
  const pendingVersions = pendingReadSourceVersions;
  let needsFollowUpUpdate = false;

  if (oldSet) {
    for (const source of oldSet) {
      if (!newSet?.has(source)) {
        const reader = source._readers?.get(instance);
        if (reader?.generation === instance.ownership.identity) {
          if (source._readers?.delete(instance) && DEVELOPMENT_BUILD_ENABLED) {
            adjustOwnershipDiagnostic('readableReaders', -1);
          }
        }
      }
    }
  }

  instance.lastRenderToken = token;

  if (newSet) {
    for (const source of newSet) {
      // Existing sources and first mounts always receive the torn-read replay.
      // For a newly entered branch, every version change after the render read
      // but before its scheduler-driven subscription commit is a missed
      // notification: this instance was not a reader yet. Multiple changed
      // sources still coalesce through the single follow-up update below.
      if (pendingVersions) {
        const sourceVersion = source._version ?? 0;
        const readVersion = pendingVersions.get(source);
        if (
          readVersion !== undefined &&
          sourceVersion !== readVersion &&
          (!oldSet || oldSet.has(source) || isRuntimeSchedulerExecuting())
        ) {
          needsFollowUpUpdate = true;
        }
      }

      let readers = source._readers;
      if (!readers) {
        readers = new Map();
        source._readers = readers;
      }
      const hadReader = readers.has(instance);
      readers.set(instance, {
        token: instance.lastRenderToken ?? 0,
        generation: instance.ownership.identity,
      });
      if (!hadReader && DEVELOPMENT_BUILD_ENABLED) {
        adjustOwnershipDiagnostic('readableReaders', 1);
      }
    }
  }

  instance.ownership.reads = newSet?.size ? newSet : undefined;

  if (needsFollowUpUpdate) {
    scheduleReadableInstanceUpdate(instance);
  }
}

export function cleanupReadableSubscriptions(
  instance: ComponentInstance,
  generation: object = instance.ownership.identity
): void {
  const sources = instance.ownership.reads;
  if (!sources || sources.size === 0) {
    instance._pendingReadSources = undefined;
    instance._pendingReadSourceVersions = undefined;
    return;
  }

  cleanupReadableSubscriptionSources(instance, sources, generation);
  instance.ownership.reads = undefined;
  instance._pendingReadSources = undefined;
  instance._pendingReadSourceVersions = undefined;
}

/** @internal Detach an exact committed read set without mutating another live generation. */
export function cleanupReadableSubscriptionSources(
  instance: ComponentInstance,
  sources: Iterable<ReadableSource<unknown>> | undefined,
  generation: object
): void {
  if (!sources) {
    return;
  }

  for (const source of sources) {
    const reader = source._readers?.get(instance);
    if (reader?.generation === generation) {
      if (source._readers?.delete(instance) && DEVELOPMENT_BUILD_ENABLED) {
        adjustOwnershipDiagnostic('readableReaders', -1);
      }
    }
  }
}

export function withDerivedReadTracking<T>(
  subscriber: DerivedSubscriber,
  fn: () => T
): T {
  const prevDerivedSubscriber = currentDerivedSubscriber;
  currentDerivedSubscriber = subscriber;
  suppressComponentReadTrackingDepth += 1;

  try {
    return fn();
  } finally {
    suppressComponentReadTrackingDepth -= 1;
    currentDerivedSubscriber = prevDerivedSubscriber;
  }
}

export function syncDerivedDependencySubscriptions(
  subscriber: DerivedSubscriber,
  prevSources: Set<ReadableSource<unknown>>,
  nextSources: Set<ReadableSource<unknown>>
): void {
  for (const source of prevSources) {
    if (!nextSources.has(source)) {
      source._derivedSubscribers?.delete(subscriber);
    }
  }

  for (const source of nextSources) {
    let subscribers = source._derivedSubscribers;
    if (!subscribers) {
      subscribers = new Set();
      source._derivedSubscribers = subscribers;
    }
    subscribers.add(subscriber);
  }
}

export function clearDerivedDependencySubscriptions(
  subscriber: DerivedSubscriber,
  sources: Set<ReadableSource<unknown>>
): void {
  for (const source of sources) {
    source._derivedSubscribers?.delete(subscriber);
  }
  sources.clear();
}

export function markReadableDerivedSubscribersDirty(
  source: ReadableSource<unknown>,
  skipCurrentSubscriber = false
): void {
  const subscribers = source._derivedSubscribers;
  if (!subscribers || subscribers.size === 0) {
    return;
  }

  for (const subscriber of subscribers) {
    // A parent derived computation that synchronously pulls a dirty child is
    // already incorporating the child's new value. Re-marking that active
    // parent would enqueue an identical second pass for the same logical
    // update when dependency insertion order happens to visit the parent
    // before the child.
    if (skipCurrentSubscriber && subscriber === currentDerivedSubscriber) {
      continue;
    }
    subscriber._markDirty();
  }
}

export function markReactivePropsDirtySource(
  source: ReadableSource<unknown>
): void {
  try {
    markRuntimeReactivePropsDirtySource(source);
  } catch {
    // Keep readable notifications side-effect safe.
  }
}

export function notifyReadableReaders(
  source: ReadableSource<unknown>,
  skipInstance?: ComponentInstance | null,
  skipOwnedBy?: ComponentInstance | null
): boolean {
  source._version = (source._version ?? 0) + 1;
  const readers = source._readers;
  let didScheduleUpdate = false;

  if (!readers || readers.size === 0) {
    return false;
  }

  for (const [instance, reader] of readers) {
    if (skipInstance && instance === skipInstance) {
      continue;
    }
    if (skipOwnedBy) {
      let owner: ComponentInstance | null = instance;
      let isOwned = false;
      while (owner) {
        if (owner === skipOwnedBy) {
          isOwned = true;
          break;
        }
        owner = owner.parentInstance;
      }
      if (isOwned) {
        continue;
      }
    }
    if (
      instance.ownership.identity !== reader.generation ||
      instance.lastRenderToken !== reader.token
    ) {
      continue;
    }
    if (instance.hasPendingUpdate) {
      continue;
    }

    scheduleReadableInstanceUpdate(instance);
    didScheduleUpdate = true;
  }

  return didScheduleUpdate;
}
