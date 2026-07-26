import {
  getCurrentComponentInstance,
  type ComponentInstance,
} from './component';
import { getCurrentContextFrame } from './context';
import { ResourceCell } from './resource-cell';
import { state } from './state';
import { enqueueRuntimeLane } from './access';
import { registerCommitOperationForInstance } from './component-lifecycle';
import { brandSnapshotSource } from './snapshot-source';
import { SSRDataMissingError } from '../common/ssr-errors';
import {
  getActiveRenderContext,
  getCurrentRenderData,
  getNextRenderKey,
  throwSSRDataMissing,
} from '../common/render-context';

export interface ResourceResult<T> {
  value: T | null;
  pending: boolean;
  error: Error | null;
  refresh(): void;
}

/** Creates a render-scoped async resource with cancellation and refresh; SSR has special data rules. */
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
    // If we're in a synchronous SSR render that has resolved data, use it.
    const renderData = getCurrentRenderData()?.resources;
    if (
      renderData &&
      (getActiveRenderContext()?.resourceDataProvided ||
        Object.keys(renderData).some((key) => key.startsWith('r:')))
    ) {
      const key = getNextRenderKey();
      if (!(key in renderData)) {
        throwSSRDataMissing();
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
    const ssrCtx = getActiveRenderContext();
    if (ssrCtx) {
      throwSSRDataMissing();
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
  const renderData = getCurrentRenderData()?.resources;
  if (
    renderData &&
    (getActiveRenderContext()?.resourceDataProvided ||
      Object.keys(renderData).some((key) => key.startsWith('r:')))
  ) {
    // Deterministic key generation: the collection step and render step use
    // the same incremental key generation to align resources.
    const key = getNextRenderKey();
    if (!(key in renderData)) {
      throwSSRDataMissing();
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
      // Client loaders belong to the successful render transaction. A post
      // scheduler task can outlive a failed render and start work for DOM that
      // was rolled back; commit operations are discarded with that render.
      const scheduledGeneration = cell.generation;
      registerCommitOperationForInstance(inst, () => {
        enqueueRuntimeLane('post', () => {
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
        registerCommitOperationForInstance(inst, () => {
          enqueueRuntimeLane('post', () => {
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
