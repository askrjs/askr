import { ownCleanup } from './ownership';
import { enqueueRuntimeLane } from './access';
import { claimHookIndex, getCurrentComponentInstance } from './component-scope';
import {
  registerCommitOperation,
  type ComponentInstance,
} from './component-internal';
import { adjustOwnershipDiagnostic } from './ownership-diagnostics';

declare const __ASKR_DEVELOPMENT_BUILD__: boolean;

/** Connection status of a {@link stream}. */
export type StreamStatus =
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'closed'
  | 'error';

/** Reactive result of a {@link stream}: current value, connection status, and controls. */
export interface StreamResult<T> {
  value: T | null;
  status: StreamStatus;
  pending: boolean;
  stale: boolean;
  error: Error | null;
  restart(): void;
  close(): void;
}

/** Options for {@link stream}. */
export interface StreamOptions<T> {
  deps?: readonly unknown[];
  initialValue?: T;
}

type StreamSource<T> = (context: {
  signal: AbortSignal;
}) => AsyncIterable<T> | PromiseLike<AsyncIterable<T>>;

interface StreamGeneration<T> {
  readonly id: number;
  readonly controller: AbortController;
  iterator: AsyncIterator<T> | null;
  returned: boolean;
  stopped: boolean;
}

interface StreamSlot<T> {
  kind: 'stream';
  source: StreamSource<T>;
  pendingSource: StreamSource<T>;
  deps: readonly unknown[];
  pendingDeps: readonly unknown[];
  readonly snapshot: StreamResult<T>;
  generation: number;
  current: StreamGeneration<T> | null;
  activated: boolean;
  disposed: boolean;
  explicitlyClosed: boolean;
  hasValue: boolean;
  cleanupRegistered: boolean;
  startQueued: boolean;
  owner: ComponentInstance | null;
}

function toError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value));
}

function depsEqual(
  left: readonly unknown[],
  right: readonly unknown[]
): boolean {
  return (
    left.length === right.length &&
    left.every((value, index) => Object.is(value, right[index]))
  );
}

function publish<T>(slot: StreamSlot<T>): void {
  if (slot.disposed) {
    return;
  }

  try {
    slot.owner?.notifyUpdate?.();
  } catch {
    // A retired owner must not make a late stream settlement observable.
  }
}

function setStartingState<T>(slot: StreamSlot<T>): void {
  const retained = slot.hasValue;
  slot.snapshot.status =
    retained && slot.generation > 0 ? 'reconnecting' : 'connecting';
  slot.snapshot.pending = !retained;
  slot.snapshot.stale = retained;
  slot.snapshot.error = null;
}

function returnIterator<T>(generation: StreamGeneration<T>): void {
  if (generation.returned || !generation.iterator) {
    return;
  }

  generation.returned = true;
  const returnMethod = generation.iterator.return;
  if (typeof returnMethod !== 'function') {
    return;
  }

  try {
    void Promise.resolve(returnMethod.call(generation.iterator)).catch(
      () => {}
    );
  } catch {
    // Cleanup is best-effort and must not replace the stream's terminal state.
  }
}

function stopGeneration<T>(generation: StreamGeneration<T> | null): void {
  if (!generation || generation.stopped) {
    return;
  }

  generation.stopped = true;
  generation.controller.abort();
  returnIterator(generation);
}

function isCurrent<T>(
  slot: StreamSlot<T>,
  generation: StreamGeneration<T>
): boolean {
  return (
    !slot.disposed &&
    !generation.stopped &&
    slot.current === generation &&
    slot.generation === generation.id
  );
}

async function consume<T>(
  slot: StreamSlot<T>,
  generation: StreamGeneration<T>,
  iterable: AsyncIterable<T>
): Promise<void> {
  const iteratorFactory = iterable?.[Symbol.asyncIterator];
  if (typeof iteratorFactory !== 'function') {
    throw new TypeError('stream() source must return an AsyncIterable.');
  }

  const iterator = iteratorFactory.call(iterable);
  if (!iterator || typeof iterator.next !== 'function') {
    throw new TypeError(
      'stream() source must return an AsyncIterable with an iterator.'
    );
  }

  generation.iterator = iterator;
  if (!isCurrent(slot, generation)) {
    returnIterator(generation);
    return;
  }

  while (isCurrent(slot, generation)) {
    const step = await iterator.next();
    if (!isCurrent(slot, generation)) {
      return;
    }
    if (step.done) {
      slot.current = null;
      slot.snapshot.status = 'closed';
      slot.snapshot.pending = false;
      slot.snapshot.stale = slot.hasValue;
      slot.snapshot.error = null;
      publish(slot);
      return;
    }

    slot.snapshot.value = step.value;
    slot.hasValue = true;
    slot.snapshot.status = 'connected';
    slot.snapshot.pending = false;
    slot.snapshot.stale = false;
    slot.snapshot.error = null;
    publish(slot);
  }
}

function startSlot<T>(slot: StreamSlot<T>): void {
  if (!slot.activated || slot.disposed) {
    return;
  }

  stopGeneration(slot.current);
  slot.explicitlyClosed = false;
  setStartingState(slot);
  publish(slot);

  const generation: StreamGeneration<T> = {
    id: ++slot.generation,
    controller: new AbortController(),
    iterator: null,
    returned: false,
    stopped: false,
  };
  slot.current = generation;

  let result: AsyncIterable<T> | PromiseLike<AsyncIterable<T>>;
  try {
    result = slot.source({ signal: generation.controller.signal });
  } catch (error) {
    if (!isCurrent(slot, generation)) {
      return;
    }
    slot.current = null;
    slot.snapshot.status = 'error';
    slot.snapshot.pending = false;
    slot.snapshot.stale = slot.hasValue;
    slot.snapshot.error = toError(error);
    publish(slot);
    return;
  }

  void Promise.resolve(result)
    .then((iterable) => consume(slot, generation, iterable))
    .catch((error: unknown) => {
      if (!isCurrent(slot, generation)) {
        return;
      }

      slot.current = null;
      slot.snapshot.status = 'error';
      slot.snapshot.pending = false;
      slot.snapshot.stale = slot.hasValue;
      slot.snapshot.error = toError(error);
      publish(slot);
    });
}

function queueStart<T>(slot: StreamSlot<T>): void {
  if (slot.startQueued || slot.disposed || slot.explicitlyClosed) {
    return;
  }

  slot.startQueued = true;
  enqueueRuntimeLane('post', () => {
    slot.startQueued = false;
    if (!slot.owner?.notifyUpdate || slot.explicitlyClosed) {
      return;
    }
    startSlot(slot);
  });
}

function closeSlot<T>(slot: StreamSlot<T>): void {
  if (slot.disposed) {
    return;
  }

  slot.explicitlyClosed = true;
  stopGeneration(slot.current);
  slot.current = null;
  slot.snapshot.status = 'closed';
  slot.snapshot.pending = false;
  slot.snapshot.stale = slot.hasValue;
  slot.snapshot.error = null;
  publish(slot);
}

function createSnapshot<T>(options: StreamOptions<T>): StreamResult<T> {
  const hasInitialValue = Object.prototype.hasOwnProperty.call(
    options,
    'initialValue'
  );
  const snapshot: StreamResult<T> = {
    value: hasInitialValue ? (options.initialValue as T) : null,
    status: 'connecting',
    pending: !hasInitialValue,
    stale: hasInitialValue,
    error: null,
    restart: () => {},
    close: () => {},
  };
  return snapshot;
}

function createSlot<T>(
  source: StreamSource<T>,
  options: StreamOptions<T>
): StreamSlot<T> {
  const snapshot = createSnapshot(options);
  const slot: StreamSlot<T> = {
    kind: 'stream',
    source,
    pendingSource: source,
    deps: (options.deps ?? []).slice(),
    pendingDeps: (options.deps ?? []).slice(),
    snapshot,
    generation: 0,
    current: null,
    activated: false,
    disposed: false,
    explicitlyClosed: false,
    hasValue: Object.prototype.hasOwnProperty.call(options, 'initialValue'),
    cleanupRegistered: false,
    startQueued: false,
    owner: null,
  };

  snapshot.restart = () => {
    if (slot.disposed) {
      return;
    }
    slot.explicitlyClosed = false;
    if (slot.activated) {
      if (!slot.startQueued) {
        startSlot(slot);
      }
    }
  };
  snapshot.close = () => closeSlot(slot);
  return slot;
}

function disposeSlot<T>(slot: StreamSlot<T>): void {
  if (slot.disposed) {
    return;
  }

  slot.disposed = true;
  stopGeneration(slot.current);
  slot.current = null;
  slot.owner = null;
  if (slot.activated && __ASKR_DEVELOPMENT_BUILD__) {
    adjustOwnershipDiagnostic('streams', -1);
  }
  slot.activated = false;
}

function commitSlot<T>(instance: ComponentInstance, slot: StreamSlot<T>): void {
  const depsChanged = !depsEqual(slot.deps, slot.pendingDeps);
  const firstCommit = !slot.activated;
  const wasRunning = slot.current !== null;

  slot.owner = instance;
  slot.source = slot.pendingSource;
  slot.deps = slot.pendingDeps;

  if (firstCommit) {
    slot.activated = true;
    if (__ASKR_DEVELOPMENT_BUILD__) {
      adjustOwnershipDiagnostic('streams', 1);
    }
  }

  if (!slot.cleanupRegistered) {
    slot.cleanupRegistered = true;
    ownCleanup(instance.owner, () => disposeSlot(slot));
  }

  if (!slot.explicitlyClosed && (firstCommit || (depsChanged && wasRunning))) {
    queueStart(slot);
  }
}

function getStreamSlot<T>(
  instance: ComponentInstance,
  index: number,
  source: StreamSource<T>,
  options: StreamOptions<T>
): StreamSlot<T> {
  const slots = (instance.lifecycleSlots ??= []);
  const existing = slots[index] as { kind?: string } | undefined;
  if (existing) {
    if (existing.kind !== 'stream') {
      throw new Error(
        `stream() lifecycle order violation: slot ${index} already belongs to ${existing.kind ?? 'another primitive'}(). ` +
          'Keep lifecycle primitives in a stable top-level order.'
      );
    }
    return existing as StreamSlot<T>;
  }

  const slot = createSlot(source, options);
  slots[index] = slot;
  return slot;
}

/** Subscribe to a streaming data source for the current component's lifetime, with auto reconnect/cleanup. */
export function stream<T>(
  source: StreamSource<T>,
  options: StreamOptions<T> = {}
): StreamResult<T> {
  const instance = getCurrentComponentInstance();
  if (!instance) {
    return createSnapshot(options);
  }

  const index = claimHookIndex(instance, 'stream');
  const slot = getStreamSlot(instance, index, source, options);
  slot.pendingSource = source;
  slot.pendingDeps = (options.deps ?? []).slice();

  if (!instance.ssr) {
    registerCommitOperation(() => commitSlot(instance, slot));
  }

  return slot.snapshot;
}
