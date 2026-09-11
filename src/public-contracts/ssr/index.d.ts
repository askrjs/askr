import {
  SSRStyleRegistrationValidation,
  SSRPortalState,
  DocumentRenderer,
  DeferredBoundaryRegistration,
  DocumentRenderContext,
  RouteAuthOptions,
  RouteRegistry,
  RouteHandler,
  SSRData,
  DocumentRenderArgs,
  Route,
  RouteRecord,
  RouteRequestResult,
  ServerQueryRegistry,
  CoreTelemetry,
  AccessDenyDecision,
  QueryPrefetchContext,
  SSRStyleRegistration,
  DataRuntime,
  AccessRedirectDecision,
} from '../core.js';
import { JSXElement, Props } from '../elements.js';
import { AuthContext } from '@askrjs/auth';
declare const PAGE_RENDER_ENVELOPE_VERSION: 1;
interface PageRenderEnvelope {
  readonly version: typeof PAGE_RENDER_ENVELOPE_VERSION;
  readonly resources: Readonly<Record<string, unknown>>;
  readonly route: unknown;
  readonly framework: Readonly<Record<string, unknown>>;
}
/**
 * Common call contracts: SSR error types
 */
declare class SSRDataMissingError extends Error {
  readonly code = 'SSR_DATA_MISSING';
  constructor(message?: string);
}
interface RenderContext {
  url: string;
  seed: number;
  data?: SSRData;
  params?: Record<string, string>;
  routes?: readonly Route[];
  routeAuth?: RouteAuthOptions;
  basePath?: string;
  authContext?: AuthContext;
  signal?: AbortSignal;
  dataRuntime?: unknown;
  queryCache?: Map<string, unknown>;
  resourceDataProvided: boolean;
  mode?: 'ssr' | 'spa';
  queryPrefetch?: QueryPrefetchContext;
  ssrCleanupFns: Array<() => void>;
  keyCounter: number;
  renderData: PageRenderEnvelope | null;
  hydrationData: PageRenderEnvelope | null;
  deferredBoundaries: DeferredBoundaryRegistration[];
  ssrStyles: Map<string, SSRStyleRegistration>;
  ssrPortals: SSRPortalState;
  cspNonce?: string;
}
/** Build a fresh SSR render context (data cache, routes, seed) for a render pass. */
declare function createRenderContext(
  seed?: number,
  opts?: {
    url?: string;
    data?: SSRData;
    params?: Record<string, string>;
    routes?: readonly Route[];
    routeAuth?: RouteAuthOptions;
    authContext?: AuthContext;
    basePath?: string;
    signal?: AbortSignal;
    dataRuntime?: unknown;
    mode?: 'ssr' | 'spa';
    queryPrefetch?: QueryPrefetchContext;
    framework?: Readonly<Record<string, unknown>>;
    envelope?: PageRenderEnvelope;
    cspNonce?: string;
  }
): RenderContext;
/**
 * Run a function with the given render context.
 * Concurrency-safe in Node.js via AsyncLocalStorage.
 */
declare function withRenderContext<T>(ctx: RenderContext, fn: () => T): T;
/** Run `fn` with `ctx` as the active SSR render context, using async-local storage. */
declare function withRenderContextAsync<T>(
  ctx: RenderContext,
  fn: () => T | PromiseLike<T>
): Promise<T>;
/**
 * Get the current render context.
 * Returns null if not inside a render.
 */
declare function getRenderContext(): RenderContext | null;
/** A single path-to-handler route binding accepted by low-level SSR route rendering. */
type SSRRoute = {
  path: string;
  handler: RouteHandler;
  namespace?: string;
};
type SSRRouteSource = {
  registry: RouteRegistry;
};
type RouteRenderOptions = SSRRouteSource & {
  url: string;
  auth?: RouteAuthOptions;
  authContext?: AuthContext;
  signal?: AbortSignal;
  seed?: number;
  data?: SSRData;
  document?: DocumentRenderer;
  request?: Request;
  dataRuntime?: DataRuntime;
  queryPrefetch?: QueryPrefetchContext;
  telemetry?: Pick<CoreTelemetry, 'ssrRender'>;
  /** @internal Precomposed page state used by hydration verification. */
  envelope?: PageRenderEnvelope;
  cspNonce?: string;
  /** Diagnose document renderers that omit request-local SSR style registrations. */
  styleRegistrationValidation?: SSRStyleRegistrationValidation;
};
type RouteStreamOptions = RouteRenderOptions & {
  onChunk(html: string): void;
  onComplete(): void;
};
/** Resolve a URL against a route registry for SSR, applying auth/policies before render. */
declare function resolveRequest(opts: {
  url: string;
  registry: RouteRegistry;
  auth?: RouteAuthOptions;
  authContext?: AuthContext;
  request?: Request;
  signal?: AbortSignal;
}): Promise<RouteRequestResult>;
/** VNode representation for SSR rendering */
type VNode = {
  type: string | SSRComponent | symbol;
  props?: Props;
  children?: unknown[];
  key?: string | number | null;
};
/**
 * Component function signature for SSR.
 * Components receive props and an optional context with signal and SSR context.
 */
type SSRComponent = (
  props: Props,
  context?: {
    signal?: AbortSignal;
    ssr?: RenderContext;
  }
) => VNode | JSXElement | string | number | boolean | null | undefined;
/** Synchronously render a component to an HTML string, without route resolution. */
declare function renderToStringSync(
  component: (
    props?: Record<string, unknown>
  ) => VNode | JSXElement | string | number | boolean | null | undefined,
  props?: Record<string, unknown>,
  options?: {
    seed?: number;
    data?: SSRData;
    /** @internal A composed page render envelope. */
    envelope?: PageRenderEnvelope;
    cspNonce?: string;
    /** @internal Request-local authentication for deferred SSR passes. */
    authContext?: import('@askrjs/auth').AuthContext;
    /** @internal Capture request-local registrations produced by this pass. */
    onContext?: (ctx: RenderContext) => void;
  }
): string;
/** Synchronously render an already-resolved route handler to an HTML string. */
declare function renderResolvedToStringSync(opts: {
  url: string;
  registry: RouteRegistry;
  handler: RouteHandler;
  params?: Record<string, string>;
  options?: {
    seed?: number;
    data?: SSRData;
    dataRuntime?: DataRuntime;
    envelope?: PageRenderEnvelope;
    cspNonce?: string;
  };
}): string;
/** Options for {@link renderRouteRequest} and {@link renderRouteRequestToString}. */
interface RenderRouteRequestOptions {
  url: string;
  registry: RouteRegistry;
  auth?: RouteAuthOptions;
  authContext?: AuthContext;
  request?: Request;
  signal?: AbortSignal;
  seed?: number;
  data?: SSRData;
  /** Askr-owned state retained independently from route loader output. */
  framework?: Readonly<Record<string, unknown>>;
  dataRuntime?: DataRuntime;
  queryPrefetch?: QueryPrefetchContext;
  queryRegistry?: ServerQueryRegistry;
  telemetry?: CoreTelemetry;
  cspNonce?: string;
}
/** Outcome of rendering a route request for SSR: a render, redirect, deny, or no-match. */
type RenderRouteRequestResult =
  | {
      kind: 'render';
      html: string;
      stream?: ReadableStream<Uint8Array>;
      styles: readonly SSRStyleRegistration[];
      params: Record<string, string>;
      record?: RouteRecord;
    }
  | AccessRedirectDecision
  | AccessDenyDecision
  | {
      kind: 'no-match';
    };
/** Resolve and render a route request for SSR, streaming the body when possible. */
declare function renderRouteRequest(
  options: RenderRouteRequestOptions
): Promise<RenderRouteRequestResult>;
/** Resolve and render a route request for SSR, always fully buffering the HTML. */
declare function renderRouteRequestToString(
  options: RenderRouteRequestOptions
): Promise<RenderRouteRequestResult>;
/**
 * Render a component or route request to a complete HTML string, synchronously.
 */
declare function renderToString(
  component: (
    props?: Record<string, unknown>
  ) => VNode | JSXElement | string | number | null
): string;
declare function renderToString(opts: RouteRenderOptions): string;
/** Stream a route request's rendered HTML to the response sink described by `opts`. */
declare function renderToStream(opts: RouteStreamOptions): void;
export {
  type DocumentRenderArgs,
  type DocumentRenderContext,
  type DocumentRenderer,
  type RenderRouteRequestOptions,
  type RenderRouteRequestResult,
  type SSRComponent,
  SSRDataMissingError,
  type SSRRoute,
  type SSRStyleRegistration,
  type SSRStyleRegistrationValidation,
  type VNode,
  createRenderContext,
  getRenderContext,
  renderResolvedToStringSync,
  renderRouteRequest,
  renderRouteRequestToString,
  renderToStream,
  renderToString,
  renderToStringSync,
  resolveRequest,
  withRenderContext,
  withRenderContextAsync,
};
