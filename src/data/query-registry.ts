import type {
  DataRuntime,
  QueryDefinition,
  QueryPrefetchContext,
  ServerQueryHandler,
} from './types';
import { createDataRuntime, getDefaultDataRuntime } from './data-runtime';
import type { CoreTelemetry } from '../common/telemetry';
import { withTelemetry } from '../common/telemetry';

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
  return {
    runtime,
    request: options.request,
    signal,
    mode: options.mode ?? 'spa',
    async prefetch(query, input) {
      return withTelemetry(options.telemetry?.queryPrefetch, {}, async () => {
        const key = query.key(input);
        if (runtime.queryData.has(key)) return true;
        let value: {};
        const handler =
          options.mode === 'ssr' ? options.registry?.get(query) : undefined;
        if (options.mode === 'ssr' && !handler) {
          if (
            typeof process !== 'undefined' &&
            process.env.NODE_ENV !== 'production'
          ) {
            // One diagnostic per query/runtime, intentionally quiet for repeats.
            const diagnostics =
              (runtime as DataRuntime & { __skipped?: Set<string> })
                .__skipped ?? new Set<string>();
            (runtime as DataRuntime & { __skipped?: Set<string> }).__skipped =
              diagnostics;
            if (!diagnostics.has(key)) {
              diagnostics.add(key);
              console.warn(`[Askr] skipped SSR query preload: ${key}`);
            }
          }
          return false;
        }
        value = handler
          ? await handler({ input, request: options.request, signal })
          : await query.fetch({ ...input, signal });
        if (signal.aborted) return false;
        runtime.queryData.set(key, value);
        return true;
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

/** Extract a runtime's cached query data into a JSON-serializable snapshot, dropping non-serializable values. */
export function dehydrateDataRuntime(
  runtime: DataRuntime
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of runtime.queryData) {
    try {
      JSON.stringify(value);
      result[key] = value;
    } catch {
      /* omit non-serializable values */
    }
  }
  return result;
}

/** Load a {@link dehydrateDataRuntime} snapshot back into a runtime's query cache. */
export function hydrateDataRuntime(runtime: DataRuntime, data: unknown): void {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return;
  for (const [key, value] of Object.entries(data as Record<string, unknown>))
    runtime.queryData.set(key, value);
}
