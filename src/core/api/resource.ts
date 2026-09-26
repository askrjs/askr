/**
 * resource(): component-owned async data with cancellation and refresh.
 *
 * The loader starts after the render that declared it commits (never during
 * render on the client). Its state lives in a stable snapshot object; the
 * component reads a readable source alongside it, so a published result
 * re-renders exactly the components that read the snapshot. On the server
 * the loader must be synchronous or preloaded; SSR render keys align server
 * values with hydration.
 */

import { SSRDataMissingError } from '../../common/ssr-errors';
import {
  getActiveRenderContext,
  getCurrentRenderData,
  getNextRenderKey,
  getResourceVerificationSnapshot,
  isHydrationVerificationRender,
  recordResourceVerificationSnapshot,
  throwSSRDataMissing,
} from '../../common/render-context';
import { queueTask } from '../reactive/scheduler';
import {
  createSource,
  currentComponent,
  hookSlot,
  notify,
  onCommit,
  readSource,
  type ComponentInstance,
  type ReadableSource,
} from './hooks';
import { ResourceCell } from './resource-cell';
import { brandSnapshotSource } from './snapshot';

/** Reactive result of a {@link resource}: current value, loading state, and controls. */
export interface ResourceResult<T> {
  value: T | null;
  pending: boolean;
  error: Error | null;
  refresh(): void;
}

function hydrationVerificationSnapshot<T>(): ResourceResult<T> {
  return brandSnapshotSource({
    value: null,
    pending: true,
    error: null,
    refresh: () => {},
  }) as ResourceResult<T>;
}

/**
 * What resource data, if any, the current render was given.
 *
 * Both the outside-a-component path and the in-component path asked this
 * question, each spelling out the same two-part test by hand. One answer keeps
 * the "is this a hydrating render with preloaded values" decision from drifting
 * between them.
 */
function resolveResourceRenderData(): {
  renderData: Record<string, unknown> | undefined;
  hasPreloadedData: boolean;
} {
  const renderData = getCurrentRenderData()?.resources;
  const hasPreloadedData = Boolean(
    renderData &&
    (getActiveRenderContext()?.resourceDataProvided ||
      Object.keys(renderData).some((key) => key.startsWith('r:')))
  );
  return { renderData, hasPreloadedData };
}

/**
 * Resolve a resource declared outside any component instance.
 *
 * Only legitimate during a synchronous SSR render that already carries resolved
 * data; every other caller is creating a resource where it cannot be owned.
 */
function resolveResourceWithoutInstance<T>(): ResourceResult<T> {
  const { renderData, hasPreloadedData } = resolveResourceRenderData();
  if (renderData && hasPreloadedData) {
    const key = getNextRenderKey();
    if (!(key in renderData)) {
      throwSSRDataMissing();
    }
    return brandSnapshotSource({
      value: renderData[key] as T,
      pending: false,
      error: null,
      refresh: () => {},
    }) as ResourceResult<T>;
  }

  // An SSR render pass without supplied data: say so rather than fetching.
  if (getActiveRenderContext()) {
    throwSSRDataMissing();
  }

  throw new Error(
    '[Askr] resource() must be called during component render inside an app. ' +
      'Do not create resources at module scope or outside render.'
  );
}

/** Create a source-driven resource whose loader receives the latest source value. */
export function resource<TSource, T>(
  source: () => TSource,
  load: (value: TSource, opts: { signal: AbortSignal }) => PromiseLike<T> | T
): ResourceResult<T>;

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
  fn: (opts: { signal: AbortSignal }) => PromiseLike<T> | T
): ResourceResult<T>;

export function resource<T, TSource = unknown>(
  sourceOrLoader:
    | (() => TSource)
    | ((opts: { signal: AbortSignal }) => PromiseLike<T> | T),
  depsOrLoader?:
    | readonly unknown[]
    | ((value: TSource, opts: { signal: AbortSignal }) => PromiseLike<T> | T)
): ResourceResult<T> {
  if (typeof depsOrLoader === 'function') {
    const source = sourceOrLoader as () => TSource;
    const load = depsOrLoader;
    const value = source();
    return createResource<T>(({ signal }) => load(value, { signal }), [value]);
  }
  return createResource(
    sourceOrLoader as (opts: { signal: AbortSignal }) => PromiseLike<T> | T,
    depsOrLoader ?? []
  );
}

interface ResourceSlot<T> {
  cell?: ResourceCell<T>;
  snapshot: ResourceResult<T>;
  uncommittedDeps: boolean;
  source: ReadableSource;
}

function createResource<T>(
  fn: (opts: { signal: AbortSignal }) => PromiseLike<T> | T,
  deps: readonly unknown[] = []
): ResourceResult<T> {
  const instance = currentComponent();
  if (!instance) {
    return resolveResourceWithoutInstance<T>();
  }
  const inst: ComponentInstance = instance;

  // Allocate one deterministic key for SSR resources and client hydration
  // resources backed by preloaded data. Verification snapshots and preloaded
  // values must consult the same key so mixed pages stay aligned.
  const { renderData, hasPreloadedData: hasPreloadedResourceData } =
    resolveResourceRenderData();
  const renderKey =
    inst.server || hasPreloadedResourceData ? getNextRenderKey() : null;
  const verificationSnapshot = renderKey
    ? getResourceVerificationSnapshot(renderKey)
    : null;

  // A concrete preloaded value is authoritative even if stale framework
  // metadata also contains a verification snapshot for the same key. It seeds
  // the cell below so later renders, which no longer see the hydration data,
  // keep the value instead of resetting to pending and refetching.
  const preloaded =
    renderData &&
    hasPreloadedResourceData &&
    renderKey &&
    renderKey in renderData
      ? { value: renderData[renderKey] as T, pending: false }
      : null;

  if (!preloaded && isHydrationVerificationRender() && verificationSnapshot) {
    const result = hydrationVerificationSnapshot<T>();
    result.value = verificationSnapshot.value as T;
    result.pending = verificationSnapshot.pending;
    return result;
  }

  // During actual client hydration, only a server-recorded verification
  // snapshot may identify an intentionally browser-only missing entry.
  if (
    !preloaded &&
    renderData &&
    hasPreloadedResourceData &&
    renderKey &&
    (inst.server || !verificationSnapshot)
  ) {
    throwSSRDataMissing();
  }

  const ssrRenderKey = inst.server ? renderKey : null;
  let seed: { value: T; pending: boolean } | null = null;
  if (preloaded) {
    seed = preloaded;
  } else if (!inst.server && verificationSnapshot) {
    seed = {
      value: verificationSnapshot.value as T,
      pending: verificationSnapshot.pending,
    };
  }

  // The slot keeps the snapshot identity stable across renders.
  const h = hookSlot<ResourceSlot<T>>(inst, 'resource', () => ({
    cell: undefined,
    uncommittedDeps: false,
    source: createSource(),
    snapshot: brandSnapshotSource({
      value: seed ? seed.value : null,
      pending: seed?.pending ?? true,
      error: null,
      refresh: () => {},
    }) as ResourceResult<T>,
  }));
  readSource(h.source);
  const publish = () => notify(h.source);

  // Initialize cell on first call
  if (!h.cell) {
    const cell = new ResourceCell<T>(fn, deps, inst);
    if (seed) {
      cell.value = seed.value;
      cell.pending = seed.pending;
      cell.snapshot.value = seed.value;
      cell.snapshot.pending = seed.pending;
    }
    // Attach debug label (component name) for richer logs
    cell.ownerName = inst.fn?.name || '<anonymous>';
    h.cell = cell;
    h.snapshot = cell.snapshot as ResourceResult<T>;

    // Subscribe and schedule component updates when cell changes
    const unsubscribe = cell.subscribe(() => {
      h.snapshot.value = cell.snapshot.value;
      h.snapshot.pending = cell.snapshot.pending;
      h.snapshot.error = cell.snapshot.error;
      publish();
    });

    inst.onCleanup(unsubscribe);
    inst.onCleanup(() => cell.dispose());

    // Render invariant: do NOT start async work during render on the client.
    // SSR remains strict/synchronous and must throw immediately if async is encountered.
    // A preloaded value is already resolved, so neither side runs the loader
    // here; refresh() and later deps changes fetch on demand.
    if (!preloaded && inst.server) {
      // SSR: must run synchronously so missing data throws during render
      cell.start(true, false);
      if (!cell.pending) {
        h.snapshot.value = cell.value;
        h.snapshot.pending = cell.pending;
        h.snapshot.error = cell.error;
      }
      if (ssrRenderKey && cell.value === null && cell.error === null) {
        recordResourceVerificationSnapshot(ssrRenderKey, {
          value: null,
          pending: cell.pending,
        });
      }
    } else if (!preloaded) {
      // Client loaders belong to the successful render transaction. A post
      // scheduler task can outlive a failed render and start work for DOM that
      // was rolled back; commit operations are discarded with that render.
      const scheduledGeneration = cell.generation;
      onCommit(inst, () => {
        queueTask(() => {
          if (inst.disposed || cell.generation !== scheduledGeneration) {
            return;
          }

          try {
            cell.start(false, false);
          } catch (err) {
            h.snapshot.value = cell.value;
            h.snapshot.pending = cell.pending;
            h.snapshot.error = (err as Error) ?? null;
            publish();
            return;
          }

          // A synchronous result did not notify subscribers; publish it.
          if (!cell.pending) {
            h.snapshot.value = cell.value;
            h.snapshot.pending = cell.pending;
            h.snapshot.error = cell.error;
            publish();
          }
        });
      });
    }
  }

  const cell = h.cell!;

  // Detect dependency changes against the deps of the last committed render.
  // On the client, cell.deps, cell.generation and the loader only advance when
  // the render that saw the change commits: a rolled-back render must not
  // consume the change, or the next render sees equal deps and never starts
  // the fetch, and a refresh() would run the new deps' loader under the
  // committed deps.
  const depsChanged =
    !cell.deps ||
    cell.deps.length !== deps.length ||
    cell.deps.some((d, i) => !Object.is(d, deps[i]));

  if (depsChanged) {
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
      if (inst.server) {
        cell.setLoader(fn);
        cell.deps = deps.slice();
        cell.generation++;
        cell.pending = true;
        cell.error = null;
        cell.start(true, false);
        if (!cell.pending) {
          h.snapshot.value = cell.value;
          h.snapshot.pending = cell.pending;
          h.snapshot.error = cell.error;
        }
      } else {
        const nextDeps = deps.slice();
        h.uncommittedDeps = true;
        onCommit(inst, () => {
          h.uncommittedDeps = false;
          cell.setLoader(fn);
          cell.deps = nextDeps;
          cell.generation++;
          cell.pending = true;
          cell.error = null;
          const scheduledGeneration = cell.generation;
          queueTask(() => {
            if (inst.disposed || cell.generation !== scheduledGeneration) {
              return;
            }

            cell.start(false, false);
            if (!cell.pending) {
              h.snapshot.value = cell.value;
              h.snapshot.pending = cell.pending;
              h.snapshot.error = cell.error;
              publish();
            }
          });
        });
      }
    } catch (err) {
      if (err instanceof SSRDataMissingError) throw err;
      cell.error = err as Error;
      cell.pending = false;
      h.snapshot.value = cell.value;
      h.snapshot.pending = cell.pending;
      h.snapshot.error = cell.error;
      // No publish: this is still render.
    }
  } else {
    cell.setLoader(fn);
    if (h.uncommittedDeps) {
      // A render proposed different deps but was rolled back before commit,
      // and this render is back on the committed deps: drop the loading state
      // that render published so the snapshot matches the committed cell.
      h.uncommittedDeps = false;
      h.snapshot.pending = cell.pending;
      h.snapshot.error = cell.error;
    }
  }

  // Return the stable snapshot object owned by the cell
  return h.snapshot;
}
