import { globalScheduler } from './scheduler';
import { getCurrentInstance, type ComponentInstance } from './component';

export interface DerivedSubscriber {
  _markDirty(): void;
  _pendingDependencySources?: Set<ReadableSource<unknown>>;
}

export interface ReadableSource<T = unknown> {
  (): T;
  _hasBeenRead?: boolean;
  _hasEverBeenRead?: boolean;
  _readers?: Map<ComponentInstance, number>;
  _derivedSubscribers?: Set<DerivedSubscriber>;
  _version?: number;
}

export function markReadableUsage(source: unknown): void {
  if (
    source &&
    typeof source === 'function' &&
    ('_hasBeenRead' in source || '_readers' in source)
  ) {
    const readable = source as ReadableSource<unknown>;
    readable._hasBeenRead = true;
    readable._hasEverBeenRead = true;
  }
}

type RendererBridge = {
  markReactivePropsDirtySource?: (source: ReadableSource<unknown>) => void;
};

let currentDerivedSubscriber: DerivedSubscriber | null = null;
let suppressComponentReadTrackingDepth = 0;
let currentFineGrainedReadSources: Set<ReadableSource<unknown>> | null = null;

export function recordReadableRead(source: ReadableSource<unknown>): void {
  source._hasEverBeenRead = true;

  if (currentFineGrainedReadSources) {
    currentFineGrainedReadSources.add(source);
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
  pendingSources: Set<ReadableSource<unknown>>,
  fn: () => T
): T {
  const previousPendingSources = currentFineGrainedReadSources;
  currentFineGrainedReadSources = pendingSources;

  try {
    return fn();
  } finally {
    currentFineGrainedReadSources = previousPendingSources;
  }
}

export function finalizeReadableSubscriptions(
  instance: ComponentInstance
): void {
  const newSet = instance._pendingReadSources;
  const token = instance._currentRenderToken;
  const pendingVersions = instance._pendingReadSourceVersions;

  finalizeReadableSubscriptionsFromSnapshot(
    instance,
    token,
    newSet,
    pendingVersions
  );
  instance._pendingReadSources = undefined;
  instance._currentRenderToken = undefined;
  instance._pendingReadSourceVersions = undefined;
}

export function finalizeReadableSubscriptionsFromSnapshot(
  instance: ComponentInstance,
  token: number | undefined,
  newSet: Set<ReadableSource<unknown>> | undefined,
  pendingReadSourceVersions:
    | Map<ReadableSource<unknown>, number>
    | undefined = instance._pendingReadSourceVersions
): void {
  if (token === undefined) {
    return;
  }

  const oldSet = instance._lastReadSources;
  const pendingVersions = pendingReadSourceVersions;
  let needsFollowUpUpdate = false;

  if (oldSet) {
    for (const source of oldSet) {
      if (!newSet?.has(source)) {
        source._readers?.delete(instance);
      }
    }
  }

  instance.lastRenderToken = token;

  if (newSet) {
    for (const source of newSet) {
      // Replay only for sources already owned by this instance, or for its
      // first committed read set. Newly entered branches in mounted components
      // keep their existing scheduler-visible intermediate states.
      if (pendingVersions && (!oldSet || oldSet.has(source))) {
        const sourceVersion = source._version ?? 0;
        const readVersion = pendingVersions.get(source);
        if (readVersion !== undefined && sourceVersion !== readVersion) {
          needsFollowUpUpdate = true;
        }
      }

      let readers = source._readers;
      if (!readers) {
        readers = new Map();
        source._readers = readers;
      }
      readers.set(instance, instance.lastRenderToken ?? 0);
    }
  }

  instance._lastReadSources = newSet ?? new Set();

  if (needsFollowUpUpdate) {
    instance.notifyUpdate?.();
  }
}

export function cleanupReadableSubscriptions(
  instance: ComponentInstance
): void {
  const sources = instance._lastReadSources;
  if (!sources || sources.size === 0) {
    instance._pendingReadSources = undefined;
    instance._pendingReadSourceVersions = undefined;
    return;
  }

  for (const source of sources) {
    source._readers?.delete(instance);
  }
  instance._lastReadSources = new Set();
  instance._pendingReadSources = undefined;
  instance._pendingReadSourceVersions = undefined;
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
  source: ReadableSource<unknown>
): void {
  const subscribers = source._derivedSubscribers;
  if (!subscribers || subscribers.size === 0) {
    return;
  }

  for (const subscriber of subscribers) {
    subscriber._markDirty();
  }
}

export function markReactivePropsDirtySource(
  source: ReadableSource<unknown>
): void {
  try {
    (
      globalThis as {
        __ASKR_RENDERER?: RendererBridge;
      }
    ).__ASKR_RENDERER?.markReactivePropsDirtySource?.(source);
  } catch {
    // Keep readable notifications side-effect safe.
  }
}

export function notifyReadableReaders(
  source: ReadableSource<unknown>,
  skipInstance?: ComponentInstance | null
): boolean {
  source._version = (source._version ?? 0) + 1;
  const readers = source._readers;
  let didScheduleUpdate = false;

  if (!readers || readers.size === 0) {
    return false;
  }

  for (const [instance, token] of readers) {
    if (skipInstance && instance === skipInstance) {
      continue;
    }
    if (instance.lastRenderToken !== token) {
      continue;
    }
    if (instance.hasPendingUpdate) {
      continue;
    }

    instance.hasPendingUpdate = true;
    const task = instance._pendingFlushTask;
    if (task) {
      globalScheduler.enqueue(task);
    } else {
      globalScheduler.enqueue(() => {
        instance.hasPendingUpdate = false;
        instance.notifyUpdate?.();
      });
    }
    didScheduleUpdate = true;
  }

  return didScheduleUpdate;
}
