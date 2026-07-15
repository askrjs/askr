import type {
  DataRuntime,
  QueryDefinition,
  QueryPrefetchContext,
  ServerQueryHandler,
} from './types';
import { createDataRuntime, getDefaultDataRuntime } from './data-runtime';
import type { CoreTelemetry } from '../common/telemetry';
import { withTelemetry } from '../common/telemetry';

export class ServerQueryRegistry {
  private readonly handlers = new Map<
    QueryDefinition<unknown, {}>,
    ServerQueryHandler<unknown, {}>
  >();

  register<TInput, TResult extends {}>(
    query: QueryDefinition<TInput, TResult>,
    handler: ServerQueryHandler<TInput, TResult>
  ): this {
    this.handlers.set(
      query as unknown as QueryDefinition<unknown, {}>,
      handler as unknown as ServerQueryHandler<unknown, {}>
    );
    return this;
  }

  get<TInput, TResult extends {}>(
    query: QueryDefinition<TInput, TResult>
  ): ServerQueryHandler<TInput, TResult> | undefined {
    return this.handlers.get(
      query as unknown as QueryDefinition<unknown, {}>
    ) as unknown as ServerQueryHandler<TInput, TResult> | undefined;
  }
}

export function createServerQueryRegistry(): ServerQueryRegistry {
  return new ServerQueryRegistry();
}

export function defineQuery<TInput, TResult extends {}>(
  definition: QueryDefinition<TInput, TResult>
): QueryDefinition<TInput, TResult> {
  return Object.freeze({ ...definition });
}

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

export async function prefetchQuery<TInput, TResult extends {}>(
  context: QueryPrefetchContext,
  query: QueryDefinition<TInput, TResult>,
  input: TInput
): Promise<boolean> {
  return context.prefetch(query, input);
}

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

export function hydrateDataRuntime(runtime: DataRuntime, data: unknown): void {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return;
  for (const [key, value] of Object.entries(data as Record<string, unknown>))
    runtime.queryData.set(key, value);
}
