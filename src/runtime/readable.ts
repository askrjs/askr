import { globalScheduler } from './scheduler';
import { getCurrentInstance, type ComponentInstance } from './component';

export interface DerivedSubscriber {
  _markDirty(): void;
  _pendingDependencySources?: Set<ReadableSource<unknown>>;
}

export interface ReadableSource<T = unknown> {
  (): T;
  _hasBeenRead?: boolean;
  _readers?: Map<ComponentInstance, number>;
  _derivedSubscribers?: Set<DerivedSubscriber>;
}

export function markReadableUsage(source: unknown): void {
  if (
    source &&
    typeof source === 'function' &&
    ('_hasBeenRead' in source || '_readers' in source)
  ) {
    (source as ReadableSource<unknown>)._hasBeenRead = true;
  }
}

type RendererBridge = {
  markReactivePropsDirtySource?: (source: ReadableSource<unknown>) => void;
};

let currentDerivedSubscriber: DerivedSubscriber | null = null;
let suppressComponentReadTrackingDepth = 0;

export function recordReadableRead(source: ReadableSource<unknown>): void {
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
}

export function finalizeReadableSubscriptions(
  instance: ComponentInstance
): void {
  const newSet = instance._pendingReadSources;
  const oldSet = instance._lastReadSources;
  const token = instance._currentRenderToken;

  if (token === undefined) {
    return;
  }

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
      let readers = source._readers;
      if (!readers) {
        readers = new Map();
        source._readers = readers;
      }
      readers.set(instance, instance.lastRenderToken ?? 0);
    }
  }

  instance._lastReadSources = newSet ?? new Set();
  instance._pendingReadSources = undefined;
  instance._currentRenderToken = undefined;
}

export function cleanupReadableSubscriptions(
  instance: ComponentInstance
): void {
  const sources = instance._lastReadSources;
  if (!sources || sources.size === 0) {
    return;
  }

  for (const source of sources) {
    source._readers?.delete(instance);
  }
  instance._lastReadSources = new Set();
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
  source: ReadableSource<unknown>
): boolean {
  const readers = source._readers;
  let didScheduleUpdate = false;

  if (!readers || readers.size === 0) {
    return false;
  }

  for (const [instance, token] of readers) {
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
