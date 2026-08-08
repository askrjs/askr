/**
 * SSR Context Management
 *
 * Provides render-context storage for server-side rendering.
 * Node SSR lazily installs AsyncLocalStorage on first use; browser builds use
 * the fallback stack.
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
  '[Askr] async SSR render context fallback is unsupported in this environment. Use synchronous SSR rendering or a runtime with AsyncLocalStorage.';

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

type AsyncHooksModule = {
  AsyncLocalStorage?: new () => RenderContextAccessor;
};

let renderContextAccessor: RenderContextAccessor | null = null;
let renderContextAccessorInitialized = false;
let asyncRenderContextAccessor: Promise<RenderContextAccessor | null> | null =
  null;

// Fallback stack for non-Node environments
let fallbackStack: RenderContext | null = null;

function ensureRenderContextAccessor(): void {
  if (renderContextAccessorInitialized) {
    return;
  }

  renderContextAccessorInitialized = true;

  if (typeof process === 'undefined' || !process.versions?.node) {
    return;
  }

  try {
    // Hide the Node builtin from browser dependency scanners.
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    const loadAsyncHooks = new Function(
      'return require(' + JSON.stringify('async_hooks') + ');'
    ) as () => AsyncHooksModule;
    const asyncHooks = loadAsyncHooks();

    if (asyncHooks.AsyncLocalStorage) {
      const asyncLocalStorage = new asyncHooks.AsyncLocalStorage();
      renderContextAccessor = {
        getStore() {
          return asyncLocalStorage.getStore();
        },
        run<R>(store: RenderContext, fn: () => R): R {
          return asyncLocalStorage.run(store, fn);
        },
      };
    }
  } catch {
    // Keep the fallback stack when async_hooks is unavailable.
  }
}

export function createRenderContext(
  seed = 12345,
  opts: {
    url?: string;
    data?: SSRData;
    params?: Record<string, string>;
    routes?: readonly Route[];
    routeAuth?: RouteAuthOptions;
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
 * Concurrency-safe in Node.js via AsyncLocalStorage.
 */
export function withRenderContext<T>(ctx: RenderContext, fn: () => T): T {
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

async function getAsyncRenderContextAccessor(): Promise<RenderContextAccessor | null> {
  ensureRenderContextAccessor();
  if (renderContextAccessor) return renderContextAccessor;
  if (typeof process === 'undefined' || !process.versions?.node) return null;
  asyncRenderContextAccessor ??= (async () => {
    try {
      const specifier = 'node:async_hooks';
      const module = (await import(
        /* @vite-ignore */ specifier
      )) as AsyncHooksModule;
      if (!module.AsyncLocalStorage) return null;
      const storage = new module.AsyncLocalStorage();
      renderContextAccessor = {
        getStore: () => storage.getStore(),
        run: <R>(store: RenderContext, fn: () => R) => storage.run(store, fn),
      };
      return renderContextAccessor;
    } catch {
      return null;
    }
  })();
  return asyncRenderContextAccessor;
}

export async function withRenderContextAsync<T>(
  ctx: RenderContext,
  fn: () => T | PromiseLike<T>
): Promise<T> {
  const accessor = await getAsyncRenderContextAccessor();
  if (accessor) return accessor.run(ctx, () => Promise.resolve(fn()));
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

configureRenderContextProvider({
  getRenderContext,
});

/**
 * Centralized SSR enforcement helper — throws a consistent error when async
 * data is encountered during synchronous SSR.
 */
export function throwSSRDataMissing(): never {
  throw new SSRDataMissingError();
}

export { SSRDataMissingError };
