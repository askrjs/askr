import type {
  DataRuntime,
  QueryDefinition,
  QueryPrefetchContext,
  ServerQueryHandler,
} from './types';
import {
  createDataRuntime,
  getDefaultDataRuntime,
  findDataRuntimeState,
  writePrefetchedQueryData,
} from './data-runtime';
import type { CoreTelemetry } from '../common/telemetry';
import { withTelemetry } from '../common/telemetry';
import { validateJsonTransportValue } from '../common/json-transport';

/** Lookup table of server handlers keyed by their {@link QueryDefinition}, built by {@link defineServerQueries}. */
export interface ServerQueryRegistry {
  readonly entries: readonly ServerQueryEntry<unknown, {}>[];
  get<TInput, TResult extends {}>(
    query: QueryDefinition<TInput, TResult>
  ): ServerQueryHandler<TInput, TResult> | undefined;
}

/** A query paired with the server handler that resolves it, produced by {@link serveQuery}. */
export interface ServerQueryEntry<TInput, TResult extends {}> {
  readonly query: QueryDefinition<TInput, TResult>;
  readonly handler: ServerQueryHandler<TInput, TResult>;
}

/** Pair a {@link QueryDefinition} with the server-side handler that resolves it. */
export function serveQuery<TInput, TResult extends {}>(
  query: QueryDefinition<TInput, TResult>,
  handler: ServerQueryHandler<TInput, TResult>
): ServerQueryEntry<TInput, TResult> {
  return Object.freeze({ query, handler });
}

/** Build a {@link ServerQueryRegistry} from one or more {@link serveQuery} entries. */
export function defineServerQueries(
  ...entries: readonly ServerQueryEntry<any, any>[]
): ServerQueryRegistry {
  const frozenEntries = Object.freeze([
    ...entries,
  ]) as readonly ServerQueryEntry<unknown, {}>[];
  const handlers = new Map(
    entries.map((entry) => [entry.query, entry.handler])
  );
  return Object.freeze({
    entries: frozenEntries,
    get<TInput, TResult extends {}>(query: QueryDefinition<TInput, TResult>) {
      return handlers.get(query) as
        | ServerQueryHandler<TInput, TResult>
        | undefined;
    },
  });
}

/** Freeze and return a reusable {@link QueryDefinition}. */
export function defineQuery<TInput, TResult extends {}>(
  definition: QueryDefinition<TInput, TResult>
): QueryDefinition<TInput, TResult> {
  return Object.freeze({ ...definition });
}

// Query keys already reported as skipped SSR preloads, per runtime. Runtimes
// are frozen, so the diagnostic state lives beside them rather than on them.
const skippedPrefetchDiagnostics = new WeakMap<DataRuntime, Set<string>>();

type InflightPrefetch = {
  readonly signal: AbortSignal;
  readonly promise: Promise<{}>;
};

// In-flight prefetch fetches, per runtime and query key. Every context that
// prefetches into the same runtime joins the running fetch for a key.
const inflightPrefetches = new WeakMap<
  DataRuntime,
  Map<string, InflightPrefetch>
>();

function getInflightPrefetches(
  runtime: DataRuntime
): Map<string, InflightPrefetch> {
  let inflight = inflightPrefetches.get(runtime);
  if (!inflight) {
    inflight = new Map();
    inflightPrefetches.set(runtime, inflight);
  }
  return inflight;
}

/**
 * Create a {@link QueryPrefetchContext} for prefetching query data ahead of
 * render, e.g. during SSR route resolution.
 */
export function createQueryPrefetchContext(
  options: {
    runtime?: DataRuntime;
    registry?: ServerQueryRegistry;
    request?: Request;
    signal?: AbortSignal;
    mode?: 'ssr' | 'spa';
    telemetry?: CoreTelemetry;
  } = {}
): QueryPrefetchContext {
  const runtime =
    options.runtime ??
    (options.mode === 'spa' ? getDefaultDataRuntime() : createDataRuntime());
  const signal = options.signal ?? new AbortController().signal;
  const storePrefetchedValue = (key: string, value: {}): boolean => {
    if (signal.aborted) return false;
    // A reader that mounted while this fetch was in flight owns newer data;
    // storing this result would revive it on the next mount.
    if (runtime.queryCache.has(key)) return true;
    const runtimeState =
      options.mode !== 'ssr' && typeof window !== 'undefined'
        ? findDataRuntimeState(runtime)
        : undefined;
    if (runtimeState) {
      writePrefetchedQueryData(runtimeState, key, value);
    } else {
      // Server/SSG payload building and hand-built runtimes keep every entry
      // for dehydration.
      runtime.queryData.set(key, value);
    }
    return true;
  };
  return {
    runtime,
    request: options.request,
    signal,
    mode: options.mode ?? 'spa',
    async prefetch(query, input) {
      return withTelemetry(options.telemetry?.queryPrefetch, {}, async () => {
        const key = query.key(input);
        // A live query cell already owns this key; its reader would ignore a
        // newly prefetched value.
        if (runtime.queryCache.has(key) || runtime.queryData.has(key)) {
          return true;
        }
        const handler =
          options.mode === 'ssr' ? options.registry?.get(query) : undefined;
        if (options.mode === 'ssr' && !handler) {
          if (
            typeof process !== 'undefined' &&
            process.env.NODE_ENV !== 'production'
          ) {
            // One diagnostic per query/runtime, intentionally quiet for repeats.
            let diagnostics = skippedPrefetchDiagnostics.get(runtime);
            if (!diagnostics) {
              diagnostics = new Set<string>();
              skippedPrefetchDiagnostics.set(runtime, diagnostics);
            }
            if (!diagnostics.has(key)) {
              diagnostics.add(key);
              console.warn(`[Askr] skipped SSR query preload: ${key}`);
            }
          }
          return false;
        }
        const inflight = getInflightPrefetches(runtime);
        for (;;) {
          let pending = inflight.get(key);
          // Join a running fetch for this key unless its own caller already
          // cancelled it while this caller is still live.
          if (!pending || (pending.signal.aborted && !signal.aborted)) {
            let promise: Promise<{}>;
            try {
              promise = Promise.resolve(
                handler
                  ? handler({ input, request: options.request, signal })
                  : query.fetch(input, { signal })
              );
            } catch (error) {
              promise = Promise.reject(error);
            }
            const entry: InflightPrefetch = { signal, promise };
            const clear = () => {
              if (inflight.get(key) === entry) inflight.delete(key);
            };
            promise.then(clear, clear);
            inflight.set(key, entry);
            pending = entry;
          }
          let value: {};
          try {
            value = await pending.promise;
          } catch (error) {
            // A fetch cancelled by its starting caller does not fail a
            // still-live joiner; it starts a replacement.
            if (pending.signal.aborted && !signal.aborted) continue;
            throw error;
          }
          return storePrefetchedValue(key, value);
        }
      });
    },
  };
}

/** Prefetch `query` with `input` into a {@link QueryPrefetchContext}'s runtime. */
export async function prefetchQuery<TInput, TResult extends {}>(
  context: QueryPrefetchContext,
  query: QueryDefinition<TInput, TResult>,
  input: TInput
): Promise<boolean> {
  return context.prefetch(query, input);
}

/**
 * Extract a runtime's cached query data into a JSON-serializable snapshot.
 * Throws a `TypeError` naming the key and path of any value that would not
 * survive JSON transport unchanged (for example a `Date`, `Map`, or bigint).
 */
export function dehydrateDataRuntime(
  runtime: DataRuntime
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of runtime.queryData) {
    validateJsonTransportValue(value, (path, reason) => {
      throw new TypeError(
        `[Askr] Query data for key ${JSON.stringify(key)} at "${path}" is not JSON transport-safe: ${reason}. ` +
          'Return JSON-compatible data from the query fetch or server handler.'
      );
    });
    result[key] = value;
  }
  return result;
}

/** Load a {@link dehydrateDataRuntime} snapshot back into a runtime's query cache. */
export function hydrateDataRuntime(runtime: DataRuntime, data: unknown): void {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return;
  const runtimeState = findDataRuntimeState(runtime);
  for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
    runtimeState?.unreadPrefetches.delete(key);
    runtime.queryData.set(key, value);
  }
}
