import type { AuthContext } from '@askrjs/auth';
import type {
  AccessDenyDecision,
  AccessRedirectDecision,
  RouteAuthOptions,
  RouteManifest,
  RouteRegistry,
} from '../common/router';
import { createDataRuntime } from '../data/data-runtime';
import { createQueryPrefetchContext } from '../data/query-registry';
import type {
  DataRuntime,
  QueryPrefetchContext,
} from '../data/types';
import type { ServerQueryRegistry } from '../data/query-registry';
import { resolveRouteRequest } from '../router/resolution';
import { createRenderContext, withRenderContextAsync, type SSRData } from './context';
import { renderSSRRouteAppToSink } from './render-sync';
import { StringSink } from './sink';

export interface RenderRouteRequestOptions {
  url: string;
  manifest?: RouteManifest;
  registry?: RouteRegistry;
  auth?: RouteAuthOptions;
  authContext?: AuthContext;
  request?: Request;
  signal?: AbortSignal;
  seed?: number;
  data?: SSRData;
  dataRuntime?: DataRuntime;
  queryPrefetch?: QueryPrefetchContext;
  queryRegistry?: ServerQueryRegistry;
}

export type RenderRouteRequestResult =
  | {
      kind: 'render';
      html: string;
      params: Record<string, string>;
    }
  | AccessRedirectDecision
  | AccessDenyDecision
  | { kind: 'no-match' };

export async function renderRouteRequestToString(
  options: RenderRouteRequestOptions
): Promise<RenderRouteRequestResult> {
  const manifest = options.manifest ?? options.registry?.manifest;
  if (!manifest) throw new Error('renderRouteRequestToString requires a route manifest or registry.');
  const signal = options.signal ?? options.request?.signal ?? new AbortController().signal;
  const request = options.request ?? new Request(new URL(options.url, 'http://localhost'));
  const runtime = options.dataRuntime ?? createDataRuntime();
  const prefetch = options.queryPrefetch ?? createQueryPrefetchContext({
    runtime,
    registry: options.queryRegistry,
    request,
    signal,
    mode: 'ssr',
  });
  const context = createRenderContext(options.seed, {
    url: options.url,
    data: options.data,
    signal,
    dataRuntime: runtime,
    queryPrefetch: prefetch,
    mode: 'ssr',
  });
  return withRenderContextAsync(context, async () => {
    const resolved = await resolveRouteRequest(options.url, {
      manifest,
      mode: 'ssr',
      auth: options.auth ?? manifest.auth,
      authContext: options.authContext,
      request,
      signal,
    });
    if (!resolved) return { kind: 'no-match' };
    if (resolved.kind !== 'render') return resolved;
    const sink = new StringSink();
    renderSSRRouteAppToSink({
      route: { path: '', handler: resolved.handler },
      params: resolved.params,
      data: options.data,
      ctx: context,
      sink,
    });
    sink.end();
    return { kind: 'render', html: sink.toString(), params: resolved.params };
  });
}
