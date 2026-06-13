import {
  claimHookIndex,
  getCurrentComponentInstance,
  registerCommitOperation,
  type ComponentInstance,
} from './component';
import { getCurrentContextFrame } from './context';
import { ResourceCell } from './resource-cell';
import { state } from './state';
import { globalScheduler } from './scheduler';
import { getSSRBridge } from './ssr-bridge';
import { brandSnapshotSource } from './snapshot-source';
import { SSRDataMissingError } from '../common/ssr-errors';
import { isRouteActivityActive } from '../common/route-activity';

export interface ResourceResult<T> {
  value: T | null;
  pending: boolean;
  error: Error | null;
  refresh(): void;
}

export type ActivityPredicate = () => boolean;

export interface TimerOptions {
  when?: ActivityPredicate | readonly ActivityPredicate[];
}

function normalizePredicates(
  predicates: TimerOptions['when']
): readonly ActivityPredicate[] {
  if (!predicates) {
    return [];
  }

  return typeof predicates === 'function' ? [predicates] : predicates;
}

function allPredicatesPass(predicates: readonly ActivityPredicate[]): boolean {
  for (const predicate of predicates) {
    if (!predicate()) {
      return false;
    }
  }

  return true;
}

type LifecycleSlotKind = 'timer' | 'listener' | 'task';

type LifecycleSlot = {
  kind: LifecycleSlotKind;
};

function getLifecycleSlot<TSlot extends LifecycleSlot>(
  instance: ComponentInstance,
  index: number,
  kind: TSlot['kind'],
  create: () => TSlot
): TSlot {
  const existing = instance.lifecycleSlots[index];

  if (existing) {
    const slot = existing as LifecycleSlot;
    if (slot.kind !== kind) {
      throw new Error(
        `${kind}() lifecycle order violation: slot ${index} already belongs to ${slot.kind}(). ` +
          'Keep lifecycle primitives in a stable top-level order.'
      );
    }

    return existing as TSlot;
  }

  const slot = create();
  instance.lifecycleSlots[index] = slot;
  return slot;
}

export function routeActive(
  pathOrPaths: string | readonly string[]
): ActivityPredicate {
  return () => isRouteActivityActive(pathOrPaths);
}

export function documentVisible(): ActivityPredicate {
  return () =>
    typeof document === 'undefined' || document.visibilityState !== 'hidden';
}

export function windowFocused(): ActivityPredicate {
  return () =>
    typeof document === 'undefined' ||
    typeof document.hasFocus !== 'function' ||
    document.hasFocus();
}

export function resource<T, const TDeps extends readonly unknown[]>(
  fn: (opts: { signal: AbortSignal }) => PromiseLike<T> | T,
  deps: TDeps
): ResourceResult<T>;

/**
 * Resource primitive — simple, deterministic async primitive
 * Usage: resource(fn, deps)
 * - fn receives { signal }
 * - captures execution context once at creation (synchronous step only)
 * - executes at most once per generation; stale async results are ignored
 * - refresh() cancels in-flight execution, increments generation and re-runs
 * - exposes { value, pending, error, refresh }
 * - during SSR, async results are disallowed and will throw synchronously
 */
export function resource<T>(
  fn: (opts: { signal: AbortSignal }) => PromiseLike<T> | T,
  deps: readonly unknown[] = []
): ResourceResult<T> {
  const instance = getCurrentComponentInstance();
  // Create a non-null alias early so it can be used in nested closures
  // without TypeScript complaining about possible null access.
  const inst = instance as ComponentInstance;

  if (!instance) {
    const ssr = getSSRBridge();
    // If we're in a synchronous SSR render that has resolved data, use it.
    const renderData = ssr.getCurrentRenderData();
    if (renderData) {
      const key = ssr.getNextKey();
      if (!(key in renderData)) {
        ssr.throwSSRDataMissing();
      }
      const val = renderData[key] as T;
      return brandSnapshotSource({
        value: val,
        pending: false,
        error: null,
        refresh: () => {},
      }) as ResourceResult<T>;
    }

    // If we are in an SSR render pass without supplied data, throw for clarity.
    const ssrCtx = ssr.getCurrentSSRContext();
    if (ssrCtx) {
      ssr.throwSSRDataMissing();
    }

    // No active component instance and not in SSR render with data.
    // Autopilot invariant: resources must be created during render within an app.
    throw new Error(
      '[Askr] resource() must be called during component render inside an app. ' +
        'Do not create resources at module scope or outside render.'
    );
  }

  // Internal ResourceCell — pure state machine now moved to its own module
  // to keep component wiring separate and ensure no component access here.
  // (See ./resource-cell.ts)

  // If we're in a synchronous SSR render that was supplied resolved data, use it
  const ssr = getSSRBridge();
  const renderData = ssr.getCurrentRenderData();
  if (renderData) {
    // Deterministic key generation: the collection step and render step use
    // the same incremental key generation to align resources.
    const key = ssr.getNextKey();
    if (!(key in renderData)) {
      ssr.throwSSRDataMissing();
    }

    // Commit synchronous value from render data and return a stable snapshot
    const val = renderData[key] as T;

    const holder = state<{
      cell?: ResourceCell<T>;
      snapshot: ResourceResult<T>;
    }>({
      cell: undefined,
      snapshot: brandSnapshotSource({
        value: val,
        pending: false,
        error: null,
        refresh: () => {},
      }) as ResourceResult<T>,
    });

    const h = holder();
    h.snapshot.value = val;
    h.snapshot.pending = false;
    h.snapshot.error = null;
    return h.snapshot;
  }

  // Persist a holder so the snapshot identity is stable across renders.
  const holder = state<{ cell?: ResourceCell<T>; snapshot: ResourceResult<T> }>(
    {
      cell: undefined,
      snapshot: brandSnapshotSource({
        value: null,
        pending: true,
        error: null,
        refresh: () => {},
      }) as ResourceResult<T>,
    }
  );

  const h = holder();

  // Initialize cell on first call
  if (!h.cell) {
    const frame = getCurrentContextFrame();
    const cell = new ResourceCell<T>(fn, deps, frame);
    // Attach debug label (component name) for richer logs
    cell.ownerName = inst.fn?.name || '<anonymous>';
    h.cell = cell;
    h.snapshot = cell.snapshot as ResourceResult<T>;

    // Subscribe and schedule component updates when cell changes
    const unsubscribe = cell.subscribe(() => {
      const cur = holder();
      cur.snapshot.value = cell.snapshot.value;
      cur.snapshot.pending = cell.snapshot.pending;
      cur.snapshot.error = cell.snapshot.error;
      holder.set(cur);
      try {
        inst.notifyUpdate?.();
      } catch {
        // ignore
      }
    });

    // Cleanup on unmount
    (inst.cleanupFns ??= []).push(() => {
      unsubscribe();
      cell.dispose();
    });

    // Render invariant: do NOT start async work during render on the client.
    // SSR remains strict/synchronous and must throw immediately if async is encountered.
    if (inst.ssr) {
      // SSR: must run synchronously so missing data throws during render
      cell.start(true, false);
      if (!cell.pending) {
        const cur = holder();
        cur.snapshot.value = cell.value;
        cur.snapshot.pending = cell.pending;
        cur.snapshot.error = cell.error;
      }
    } else {
      // Client: start after render via scheduler (never inline)
      const scheduledGeneration = cell.generation;
      globalScheduler.enqueueInLane('post', () => {
        if (!inst.notifyUpdate || cell.generation !== scheduledGeneration) {
          return;
        }

        try {
          cell.start(false, false);
        } catch (err) {
          // Non-SSR: reflect synchronous errors into snapshot via manual update
          const cur = holder();
          cur.snapshot.value = cell.value;
          cur.snapshot.pending = cell.pending;
          cur.snapshot.error = (err as Error) ?? null;
          holder.set(cur);
          inst.notifyUpdate?.();
          return;
        }

        // If the resource completed synchronously, subscribers were not notified.
        // Force a re-render so the component can observe the value.
        if (!cell.pending) {
          const cur = holder();
          cur.snapshot.value = cell.value;
          cur.snapshot.pending = cell.pending;
          cur.snapshot.error = cell.error;
          holder.set(cur);
          inst.notifyUpdate?.();
        }
      });
    }
  }

  const cell = h.cell!;
  cell.setLoader(fn);

  // Detect dependency changes and refresh immediately
  const depsChanged =
    !cell.deps ||
    cell.deps.length !== deps.length ||
    cell.deps.some((d, i) => !Object.is(d, deps[i]));

  if (depsChanged) {
    cell.deps = deps.slice();
    cell.generation++;
    cell.pending = true;
    cell.error = null;

    // Synchronously reflect the pending state into the stable snapshot so the
    // render that triggered the deps change can surface a loading indicator.
    // The async start() runs with notify=false and the deps-change branch never
    // re-published the snapshot, so without this a deps-driven refetch jumped
    // straight from the old value to the new value, never exposing pending.
    // Stale-while-revalidate: the previous value is retained until the new
    // fetch resolves.
    h.snapshot.pending = true;
    h.snapshot.error = null;
    try {
      if (inst.ssr) {
        cell.start(true, false);
        if (!cell.pending) {
          const cur = holder();
          cur.snapshot.value = cell.value;
          cur.snapshot.pending = cell.pending;
          cur.snapshot.error = cell.error;
        }
      } else {
        const scheduledGeneration = cell.generation;
        globalScheduler.enqueueInLane('post', () => {
          if (!inst.notifyUpdate || cell.generation !== scheduledGeneration) {
            return;
          }

          cell.start(false, false);
          if (!cell.pending) {
            const cur = holder();
            cur.snapshot.value = cell.value;
            cur.snapshot.pending = cell.pending;
            cur.snapshot.error = cell.error;
            holder.set(cur);
            inst.notifyUpdate?.();
          }
        });
      }
    } catch (err) {
      if (err instanceof SSRDataMissingError) throw err;
      cell.error = err as Error;
      cell.pending = false;
      const cur = holder();
      cur.snapshot.value = cell.value;
      cur.snapshot.pending = cell.pending;
      cur.snapshot.error = cell.error;
      // Do not call holder.set() here; this is still render.
    }
  }

  // Return the stable snapshot object owned by the cell
  return h.snapshot;
}

type ListenerOptions = boolean | AddEventListenerOptions | undefined;

type NormalizedListenerOptions =
  | boolean
  | {
      capture?: boolean;
      once?: boolean;
      passive?: boolean;
      signal?: AbortSignal;
    }
  | undefined;

interface ListenerSlot extends LifecycleSlot {
  kind: 'listener';
  target: EventTarget | null;
  event: string;
  handler: EventListener;
  listener: EventListener;
  options: NormalizedListenerOptions;
  pendingTarget: EventTarget;
  pendingEvent: string;
  pendingHandler: EventListener;
  pendingOptions: NormalizedListenerOptions;
  attached: boolean;
  cleanupRegistered: boolean;
}

function normalizeListenerOptions(
  options: ListenerOptions
): NormalizedListenerOptions {
  if (options === undefined || typeof options === 'boolean') {
    return options;
  }

  return {
    ...(options.capture !== undefined ? { capture: options.capture } : {}),
    ...(options.once !== undefined ? { once: options.once } : {}),
    ...(options.passive !== undefined ? { passive: options.passive } : {}),
    ...(options.signal !== undefined ? { signal: options.signal } : {}),
  };
}

function listenerOptionsEqual(
  a: NormalizedListenerOptions,
  b: NormalizedListenerOptions
): boolean {
  if (a === b) {
    return true;
  }
  if (typeof a === 'boolean' || typeof b === 'boolean') {
    return a === b;
  }
  if (!a || !b) {
    return a === b;
  }

  return (
    a.capture === b.capture &&
    a.once === b.once &&
    a.passive === b.passive &&
    a.signal === b.signal
  );
}

function detachListenerSlot(slot: ListenerSlot): void {
  if (!slot.attached || !slot.target) {
    return;
  }

  slot.target.removeEventListener(slot.event, slot.listener, slot.options);
  slot.attached = false;
}

function commitListenerSlot(
  instance: ComponentInstance,
  slot: ListenerSlot
): void {
  slot.handler = slot.pendingHandler;

  const shouldReattach =
    !slot.attached ||
    slot.target !== slot.pendingTarget ||
    slot.event !== slot.pendingEvent ||
    !listenerOptionsEqual(slot.options, slot.pendingOptions);

  if (shouldReattach) {
    detachListenerSlot(slot);
    slot.target = slot.pendingTarget;
    slot.event = slot.pendingEvent;
    slot.options = slot.pendingOptions;
    slot.target.addEventListener(slot.event, slot.listener, slot.options);
    slot.attached = true;
  }

  if (!slot.cleanupRegistered) {
    slot.cleanupRegistered = true;
    instance.cleanupFns.push(() => {
      detachListenerSlot(slot);
      slot.cleanupRegistered = false;
    });
  }
}

export function on(
  target: EventTarget,
  event: string,
  handler: EventListener,
  options?: ListenerOptions
): void {
  const instance = getCurrentComponentInstance();
  if (!instance) {
    return;
  }

  const index = claimHookIndex(instance, 'on');
  const normalizedOptions = normalizeListenerOptions(options);
  const slot = getLifecycleSlot<ListenerSlot>(
    instance,
    index,
    'listener',
    () => {
      const createdSlot = {
        kind: 'listener' as const,
        target: null,
        event,
        handler,
        listener: ((evt: Event) => {
          createdSlot.handler.call(createdSlot.target, evt);
        }) as EventListener,
        options: undefined,
        pendingTarget: target,
        pendingEvent: event,
        pendingHandler: handler,
        pendingOptions: normalizedOptions,
        attached: false,
        cleanupRegistered: false,
      };
      return createdSlot;
    }
  );

  slot.pendingTarget = target;
  slot.pendingEvent = event;
  slot.pendingHandler = handler;
  slot.pendingOptions = normalizedOptions;

  registerCommitOperation(() => {
    commitListenerSlot(instance, slot);
  });
}

interface TimerSlot extends LifecycleSlot {
  kind: 'timer';
  id: ReturnType<typeof setInterval> | null;
  intervalMs: number | null;
  pendingIntervalMs: number;
  callback: () => void;
  predicates: readonly ActivityPredicate[];
  pendingCallback: () => void;
  pendingPredicates: readonly ActivityPredicate[];
  cleanupRegistered: boolean;
}

function stopTimerSlot(slot: TimerSlot): void {
  if (slot.id === null) {
    return;
  }

  clearInterval(slot.id);
  slot.id = null;
}

function startTimerSlot(slot: TimerSlot): void {
  slot.id = setInterval(() => {
    if (allPredicatesPass(slot.predicates)) {
      slot.callback();
    }
  }, slot.intervalMs ?? slot.pendingIntervalMs);
}

function commitTimerSlot(instance: ComponentInstance, slot: TimerSlot): void {
  const intervalChanged = slot.intervalMs !== slot.pendingIntervalMs;

  slot.callback = slot.pendingCallback;
  slot.predicates = slot.pendingPredicates;

  if (slot.id === null || intervalChanged) {
    stopTimerSlot(slot);
    slot.intervalMs = slot.pendingIntervalMs;
    startTimerSlot(slot);
  }

  if (!slot.cleanupRegistered) {
    slot.cleanupRegistered = true;
    instance.cleanupFns.push(() => {
      stopTimerSlot(slot);
      slot.cleanupRegistered = false;
    });
  }
}

export function timer(
  intervalMs: number,
  fn: () => void,
  options?: TimerOptions
): void {
  const instance = getCurrentComponentInstance();
  if (!instance) {
    return;
  }

  const index = claimHookIndex(instance, 'timer');
  const predicates = normalizePredicates(options?.when);
  const slot = getLifecycleSlot<TimerSlot>(instance, index, 'timer', () => ({
    kind: 'timer',
    id: null,
    intervalMs: null,
    pendingIntervalMs: intervalMs,
    callback: fn,
    predicates,
    pendingCallback: fn,
    pendingPredicates: predicates,
    cleanupRegistered: false,
  }));

  slot.pendingIntervalMs = intervalMs;
  slot.pendingCallback = fn;
  slot.pendingPredicates = predicates;

  registerCommitOperation(() => {
    commitTimerSlot(instance, slot);
  });
}

export function stream<T>(
  _source: unknown,
  _options?: Record<string, unknown>
): { value: T | null; pending: boolean; error: Error | null } {
  // Stub implementation: no-op.
  return { value: null, pending: true, error: null };
}

export function task(
  fn: () => void | (() => void) | PromiseLike<void | (() => void)>
): void {
  const instance = getCurrentComponentInstance();
  if (!instance) {
    return;
  }

  const index = claimHookIndex(instance, 'task');
  const slot = getLifecycleSlot<
    LifecycleSlot & {
      kind: 'task';
      started: boolean;
      task: typeof fn;
    }
  >(instance, index, 'task', () => ({
    kind: 'task',
    started: false,
    task: fn,
  }));

  if (!slot.started) {
    slot.task = fn;
    registerCommitOperation(async () => {
      if (slot.started) {
        return;
      }

      slot.started = true;
      return await slot.task();
    });
  }
}

/**
 * Capture the result of a synchronous expression at call time and return a
 * thunk that returns the captured value later. This is a low-level helper for
 * cases where async continuations need to observe a snapshot of values at the
 * moment scheduling occurred.
 *
 * Usage (public API):
 * const snapshot = capture(() => someState());
 * Promise.resolve().then(() => { use(snapshot()); });
 */
export function capture<T>(fn: () => T): () => T {
  const value = fn();
  return () => value;
}
