/**
 * SSR Context Management
 *
 * Provides render-context storage for server-side rendering.
 * Node SSR lazily installs AsyncLocalStorage on first use; browser builds use
 * the fallback stack.
 */

import { SSRDataMissingError } from './errors';
import { clearEscapeCache } from './escape';

export type { SSRData } from '../common/ssr';
import type { SSRData } from '../common/ssr';
import type { Route, RouteAuthOptions } from '../common/router';

// Unified per-render context combining SSRContext and RenderContext
export interface RenderContext {
  url: string;
  seed: number;
  data?: SSRData;
  params?: Record<string, string>;
  routes?: readonly Route[];
  routeAuth?: RouteAuthOptions;
  signal?: AbortSignal;
  queryCache?: Map<string, unknown>;
  ssrCleanupFns: Array<() => void>;
  // Per-render key state (moved from render-keys.ts globals)
  keyCounter: number;
  renderData: Record<string, unknown> | null;
}

// Legacy alias for compatibility
export type SSRContext = RenderContext;

type RenderContextAccessor = {
  getStore(): RenderContext | undefined;
  run<R>(store: RenderContext, fn: () => R): R;
};

type AsyncHooksModule = {
  AsyncLocalStorage?: new () => RenderContextAccessor;
};

let renderContextAccessor: RenderContextAccessor | null = null;
let renderContextAccessorInitialized = false;

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
    signal?: AbortSignal;
  } = {}
): RenderContext {
  clearEscapeCache();

  return {
    url: opts.url ?? '',
    seed,
    data: opts.data,
    params: opts.params,
    routes: opts.routes,
    routeAuth: opts.routeAuth,
    signal: opts.signal,
    queryCache: new Map<string, unknown>(),
    ssrCleanupFns: [],
    keyCounter: 0,
    renderData: null,
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
    return fn();
  } finally {
    fallbackStack = prev;
  }
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

// Legacy API aliases (deprecated, for backwards compatibility)
export const getSSRContext = getRenderContext;
export const withSSRContext = withRenderContext;
export const getCurrentSSRContext = getRenderContext;

export function runWithSSRContext<T>(ctx: RenderContext, fn: () => T): T {
  // This was a separate path for sync detection; now unified
  return withRenderContext(ctx, fn);
}

/**
 * Centralized SSR enforcement helper — throws a consistent error when async
 * data is encountered during synchronous SSR.
 */
export function throwSSRDataMissing(): never {
  throw new SSRDataMissingError();
}

export { SSRDataMissingError };
