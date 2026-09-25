/**
 * SSR Context Management
 *
 * Provides render-context storage for server-side rendering.
 * The first render installs AsyncLocalStorage from `globalThis` or, on Node and
 * Node-compatible runtimes (Deno, Bun, Workers with `nodejs_compat`), from
 * `process.getBuiltinModule('node:async_hooks')`. Neither is a static import,
 * so browser bundles never pull in the Node builtin. Runtimes without either
 * use a synchronous fallback stack and reject async render contexts.
 */

import { SSRDataMissingError } from './errors';
import { clearEscapeCache } from './escape';
import { isPromiseLike } from '../common/promise';
import { configureRenderContextProvider } from '../common/render-context';
import { createDataRuntime } from '../data/data-runtime';

export type { SSRData } from '../common/ssr';
import type { SSRData, SSRStyleRegistration } from '../common/ssr';
import type { Route, RouteAuthOptions } from '../common/router';
import {
  createPageRenderEnvelope,
  withHydrationRenderUrl,
} from '../common/page-render-envelope';
import type { PageRenderEnvelope } from '../common/page-render-envelope';
import type { AuthContext } from '@askrjs/auth';

const FALLBACK_ASYNC_CONTEXT_ERROR =
  "[Askr] async SSR render context fallback is unsupported in this environment. Use synchronous SSR rendering or a runtime with AsyncLocalStorage (globalThis.AsyncLocalStorage or process.getBuiltinModule('node:async_hooks')).";

export interface RenderContext {
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
  queryPrefetch?: import('../data/types').QueryPrefetchContext;
  ssrCleanupFns: Array<() => void>;
  // Per-render key state (moved from render-keys.ts globals)
  keyCounter: number;
  renderData: PageRenderEnvelope | null;
  hydrationData: PageRenderEnvelope | null;
  deferredBoundaries: import('../common/render-context').DeferredBoundaryRegistration[];
  ssrStyles: Map<string, SSRStyleRegistration>;
  ssrPortals: import('../common/render-context').SSRPortalState;
  cspNonce?: string;
}

type RenderContextAccessor = {
  getStore(): RenderContext | undefined;
  run<R>(store: RenderContext, fn: () => R): R;
};

type AsyncLocalStorageConstructor = new () => RenderContextAccessor;

type AsyncLocalStorageHost = {
  AsyncLocalStorage?: AsyncLocalStorageConstructor;
  process?: {
    getBuiltinModule?: (
      id: string
    ) => { AsyncLocalStorage?: AsyncLocalStorageConstructor } | undefined;
  };
};

let renderContextAccessor: RenderContextAccessor | null = null;
let renderContextAccessorInitialized = false;

// Fallback stack for runtimes without AsyncLocalStorage
let fallbackStack: RenderContext | null = null;

function resolveAsyncLocalStorage(): AsyncLocalStorageConstructor | undefined {
  const host = globalThis as AsyncLocalStorageHost;
  return (
    host.AsyncLocalStorage ??
    host.process?.getBuiltinModule?.('node:async_hooks')?.AsyncLocalStorage
  );
}

function ensureRenderContextAccessor(): void {
  if (renderContextAccessorInitialized) {
    return;
  }

  renderContextAccessorInitialized = true;
  const AsyncLocalStorage = resolveAsyncLocalStorage();
  if (AsyncLocalStorage) {
    renderContextAccessor = new AsyncLocalStorage();
  }
}

/** Build a fresh SSR render context (data cache, routes, seed) for a render pass. */
/** @internal Request-local route state carried into deferred SSR passes. */
export type RenderRouteState = Pick<
  RenderContext,
  'url' | 'routes' | 'basePath' | 'params'
>;

export function createRenderContext(
  seed = 12345,
  opts: {
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
    queryPrefetch?: import('../data/types').QueryPrefetchContext;
    framework?: Readonly<Record<string, unknown>>;
    envelope?: PageRenderEnvelope;
    cspNonce?: string;
  } = {}
): RenderContext {
  clearEscapeCache();
  const queryCache = new Map<string, unknown>();

  const envelope =
    opts.envelope ??
    createPageRenderEnvelope({
      resources: opts.data,
      framework: opts.framework,
    });
  const hydrationEnvelope = opts.url
    ? withHydrationRenderUrl(envelope, opts.url)
    : envelope;
  return {
    url: opts.url ?? '',
    seed,
    data: opts.data,
    params: opts.params,
    routes: opts.routes,
    routeAuth: opts.routeAuth,
    authContext: opts.authContext,
    basePath: opts.basePath,
    signal: opts.signal,
    dataRuntime: opts.dataRuntime ?? createDataRuntime({ queryCache }),
    mode: opts.mode ?? 'ssr',
    queryPrefetch: opts.queryPrefetch,
    queryCache,
    resourceDataProvided: opts.envelope
      ? Object.keys(envelope.resources).some((key) => key.startsWith('r:'))
      : opts.data !== undefined,
    ssrCleanupFns: [],
    keyCounter: 0,
    renderData: envelope,
    hydrationData: hydrationEnvelope,
    deferredBoundaries: [],
    ssrStyles: new Map(),
    ssrPortals: {
      slots: new Map(),
      nextHostId: 0,
    },
    cspNonce: opts.cspNonce,
  };
}

/**
 * Run a function with the given render context.
 * Concurrency-safe on runtimes with AsyncLocalStorage (Node.js, Deno, Bun,
 * Workers with `nodejs_compat`); elsewhere only synchronous work is accepted.
 */
export function withRenderContext<T>(ctx: RenderContext, fn: () => T): T {
  ensureRenderContextProvider();
  ensureRenderContextAccessor();
  if (renderContextAccessor) {
    return renderContextAccessor.run(ctx, fn);
  }
  // Fallback: stack-based (not concurrency-safe)
  const prev = fallbackStack;
  fallbackStack = ctx;
  try {
    const result = fn();
    if (isPromiseLike(result)) {
      throw new Error(FALLBACK_ASYNC_CONTEXT_ERROR);
    }
    return result;
  } finally {
    fallbackStack = prev;
  }
}

/** Run `fn` with `ctx` as the active SSR render context, using async-local storage. */
export async function withRenderContextAsync<T>(
  ctx: RenderContext,
  fn: () => T | PromiseLike<T>
): Promise<T> {
  ensureRenderContextProvider();
  ensureRenderContextAccessor();
  if (renderContextAccessor) {
    return renderContextAccessor.run(ctx, () => Promise.resolve(fn()));
  }
  throw new Error(FALLBACK_ASYNC_CONTEXT_ERROR);
}

/**
 * Get the current render context.
 * Returns null if not inside a render.
 */
export function getRenderContext(): RenderContext | null {
  ensureRenderContextAccessor();
  if (renderContextAccessor) {
    return renderContextAccessor.getStore() ?? null;
  }
  return fallbackStack;
}

let renderContextProvided = false;

/**
 * Publish this module's render-context accessor to `common/render-context`.
 *
 * Runtime code (resources, portals, deferred routes) asks that module for the
 * active SSR context, and it cannot import SSR. Installing the accessor at
 * module scope meant the answer depended on whether anything had imported this
 * module; entering a render context composes it instead. Consumers only ever
 * observe a context from inside one, so this covers every reader.
 */
function ensureRenderContextProvider(): void {
  if (renderContextProvided) return;
  renderContextProvided = true;
  configureRenderContextProvider({ getRenderContext });
}

/**
 * Centralized SSR enforcement helper — throws a consistent error when async
 * data is encountered during synchronous SSR.
 */
export function throwSSRDataMissing(): never {
  throw new SSRDataMissingError();
}

export { SSRDataMissingError };
