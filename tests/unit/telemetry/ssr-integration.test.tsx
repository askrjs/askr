import { describe, expect, it } from 'vite-plus/test';
import type {
  CoreTelemetry,
  TelemetryFields,
  TelemetrySpan,
} from '../../../src/common/telemetry';
import {
  createQueryPrefetchContext,
  defineServerQueries,
  defineQuery,
  serveQuery,
} from '../../../src/data/query-registry';
import { createRouteRegistry, route } from '../../../src/router/route';
import { renderRouteRequestToString } from '../../../src/ssr';

type Event = {
  phase: 'start' | 'end' | 'error';
  operation: string;
  fields: TelemetryFields;
};

function recordingTelemetry(events: Event[]): CoreTelemetry {
  const record =
    (operation: string): TelemetrySpan =>
    <T,>(fields: TelemetryFields, work: () => T): T => {
      events.push({ phase: 'start', operation, fields });
      try {
        const result = work();
        if (
          result !== null &&
          (typeof result === 'object' || typeof result === 'function') &&
          typeof (result as PromiseLike<unknown>).then === 'function'
        ) {
          return Promise.resolve(result).then(
            (value) => {
              events.push({ phase: 'end', operation, fields });
              return value;
            },
            (error: unknown) => {
              events.push({ phase: 'error', operation, fields });
              throw error;
            }
          ) as T;
        }
        events.push({ phase: 'end', operation, fields });
        return result;
      } catch (error) {
        events.push({ phase: 'error', operation, fields });
        throw error;
      }
    };

  return {
    routeMatch: record('route-match'),
    loader: record('loader'),
    queryPrefetch: record('query-prefetch'),
    ssrRender: record('ssr-render'),
  };
}

describe('SSR telemetry integration', () => {
  it('should nest route, query, and loader work inside the SSR render span', async () => {
    const events: Event[] = [];
    const telemetry = recordingTelemetry(events);
    const query = defineQuery({
      key: () => 'catalog',
      fetch: async () => ({ title: 'catalog' }),
    });
    const queryRegistry = defineServerQueries(
      serveQuery(query, async () => ({ title: 'catalog' }))
    );
    const registry = createRouteRegistry(() => {
      route('/catalog/{id}', ({ id }) => <main>{id}</main>, {
        preload: ({ data }) => data.prefetch(query, {}),
        loader: async () => ({ ready: true }),
      });
    });

    const result = await renderRouteRequestToString({
      url: '/catalog/42',
      registry,
      queryRegistry,
      telemetry,
    });

    expect(result.kind).toBe('render');
    expect(
      events.map(({ phase, operation }) => `${phase}:${operation}`)
    ).toEqual([
      'start:ssr-render',
      'start:route-match',
      'start:query-prefetch',
      'end:query-prefetch',
      'start:loader',
      'end:loader',
      'end:route-match',
      'end:ssr-render',
    ]);
    expect(
      events.find((event) => event.operation === 'loader')?.fields
    ).toEqual({
      route: '/catalog/{id}',
    });
  });

  it('should preserve loader rejection while closing the instrumentation chain as errors', async () => {
    const events: Event[] = [];
    const telemetry = recordingTelemetry(events);
    const failure = new Error('loader failed');
    const registry = createRouteRegistry(() => {
      route('/failure', () => <main>never</main>, {
        loader: async () => {
          throw failure;
        },
      });
    });

    await expect(
      renderRouteRequestToString({ url: '/failure', registry, telemetry })
    ).rejects.toBe(failure);
    expect(
      events.map(({ phase, operation }) => `${phase}:${operation}`)
    ).toEqual([
      'start:ssr-render',
      'start:route-match',
      'start:loader',
      'error:loader',
      'error:route-match',
      'error:ssr-render',
    ]);
  });

  it('should keep query prefetch usable without telemetry', async () => {
    const query = defineQuery({
      key: () => 'plain',
      fetch: async () => ({ ready: true }),
    });
    const context = createQueryPrefetchContext();

    await expect(context.prefetch(query, {})).resolves.toBe(true);
  });
});
