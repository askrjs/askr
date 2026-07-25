import {
  type DocumentRenderArgs,
  type DocumentRenderContext,
  type DocumentRenderer,
  renderDocument,
} from '../common/ssr';
import type {
  RouteAuthOptions,
  RouteHandler,
  RouteRegistry,
  RouteRequestResult,
} from '../common/router';
import * as RouteModule from '../router/route';
import type { AuthContext } from '@askrjs/auth';
import {
  createRenderContext,
  type RenderContext,
  type SSRData,
} from './context';
import { resolvePolicyAwareSSRRoute } from './route-policy-resolution';
import { StringSink, StreamSink, type RenderSink } from './sink';
import type { CoreTelemetry } from '../common/telemetry';
import { withTelemetry } from '../common/telemetry';
import type { PageRenderEnvelope } from '../common/page-render-envelope';
import { validateCspNonce } from '../csp-nonce';

export type SSRRoute = {
  path: string;
  handler: RouteHandler;
  namespace?: string;
};

type SSRRouteSource = { registry: RouteRegistry };

export type RouteRenderOptions = SSRRouteSource & {
  url: string;
  seed?: number;
  data?: SSRData;
  document?: DocumentRenderer;
  request?: Request;
  dataRuntime?: import('../data/types').DataRuntime;
  queryPrefetch?: import('../data/types').QueryPrefetchContext;
  telemetry?: Pick<CoreTelemetry, 'ssrRender'>;
  /** @internal Precomposed page state used by hydration verification. */
  envelope?: PageRenderEnvelope;
  cspNonce?: string;
};

export type RouteStreamOptions = RouteRenderOptions & {
  onChunk(html: string): void;
  onComplete(): void;
};

type ResolvedSSRRouteRender = {
  url: string;
  requestUrl: URL;
  route: SSRRoute;
  params: Record<string, string>;
  seed: number;
  data?: SSRData;
  ctx: RenderContext;
  document?: DocumentRenderer;
  cspNonce?: string;
};

export type RouteAppRenderInput = {
  route: SSRRoute;
  params: Record<string, string>;
  data?: SSRData;
  ctx: RenderContext;
  sink: RenderSink;
};

export interface RouteRenderHost {
  renderAppToSink(input: RouteAppRenderInput): void;
}

export async function resolveRequest(opts: {
  url: string;
  registry: RouteRegistry;
  auth?: RouteAuthOptions;
  authContext?: AuthContext;
  request?: Request;
  signal?: AbortSignal;
}): Promise<RouteRequestResult> {
  if (!opts?.registry) {
    throw new TypeError('resolveRequest requires opts.registry.');
  }

  const { url, auth, authContext, request, signal } = opts;
  return await RouteModule.resolveRouteRequest(url, {
    registry: opts.registry,
    mode: 'ssr',
    auth,
    authContext,
    request,
    signal,
  });
}

function resolveSSRRouteSource(source: SSRRouteSource): SSRRoute[] {
  if (source.registry.routes.length === 0) {
    throw new Error('SSR requires a non-empty route registry.');
  }

  return source.registry.routes.map((route) => ({
    ...route,
    path: route.path,
    handler: route.handler,
    namespace: route.namespace,
  }));
}

function resolveSSRRouteRender(
  opts: RouteRenderOptions
): ResolvedSSRRouteRender {
  const { seed = 12345, data, document } = opts;
  const cspNonce = validateCspNonce(opts.cspNonce);
  const routeTable = resolveSSRRouteSource(opts);
  const resolvedRoute = resolvePolicyAwareSSRRoute(opts, routeTable);
  const requestUrl = new URL(resolvedRoute.url, 'http://localhost');

  const ctx = createRenderContext(seed, {
    url: resolvedRoute.url,
    data,
    params: resolvedRoute.params,
    routes: routeTable,
    dataRuntime: opts.dataRuntime,
    queryPrefetch: opts.queryPrefetch,
    envelope: opts.envelope,
    cspNonce,
  });

  return {
    url: resolvedRoute.url,
    requestUrl,
    route: resolvedRoute.route,
    params: resolvedRoute.params,
    seed,
    data,
    ctx,
    document,
    cspNonce,
  };
}

function buildDocumentRenderArgs(
  resolved: ResolvedSSRRouteRender,
  appHtml: string
): DocumentRenderArgs {
  const context: DocumentRenderContext = {
    mode: 'ssr',
    url: resolved.url,
    pathname: resolved.requestUrl.pathname,
    search: resolved.requestUrl.search,
    hash: resolved.requestUrl.hash,
    params: resolved.params,
    data: resolved.data,
    seed: resolved.seed,
    route: {
      path: resolved.route.path,
      namespace: resolved.route.namespace,
    },
    cspNonce: resolved.cspNonce,
  };

  return {
    appHtml,
    context,
  };
}

function renderResolvedRouteAppToSink(
  resolved: ResolvedSSRRouteRender,
  sink: RenderSink,
  host: RouteRenderHost
): void {
  host.renderAppToSink({
    route: resolved.route,
    params: resolved.params,
    data: resolved.data,
    ctx: resolved.ctx,
    sink,
  });
}

function renderToSinkInternal(
  opts: RouteRenderOptions & { sink: RenderSink },
  host: RouteRenderHost
) {
  const { sink, ...renderOptions } = opts;
  return withTelemetry(renderOptions.telemetry?.ssrRender, {}, () => {
    const resolved = resolveSSRRouteRender(renderOptions);

    if (!resolved.document) {
      renderResolvedRouteAppToSink(resolved, sink, host);
      return;
    }

    const appSink = new StringSink();
    renderResolvedRouteAppToSink(resolved, appSink, host);
    appSink.end();
    sink.write(
      renderDocument(
        resolved.document,
        buildDocumentRenderArgs(resolved, appSink.toString()),
        'renderToString()/renderToStream()'
      )
    );
  });
}

export function renderRouteToString(
  opts: RouteRenderOptions,
  host: RouteRenderHost
): string {
  const sink = new StringSink();
  renderToSinkInternal({ ...opts, sink }, host);
  sink.end();
  return sink.toString();
}

export function renderRouteToStream(
  opts: RouteStreamOptions,
  host: RouteRenderHost
): void {
  const sink = new StreamSink(opts.onChunk, opts.onComplete);
  renderToSinkInternal({ ...opts, sink }, host);
  sink.end();
}
