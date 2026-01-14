/**
 * SSR Context Management
 *
 * Provides concurrency-safe context for server-side rendering.
 * In Node.js, uses AsyncLocalStorage for isolation between concurrent requests.
 * Falls back to stack-based approach in non-Node environments.
 */

import { SSRDataMissingError } from './errors';

export type { SSRData } from '../common/ssr';
import type { SSRData } from '../common/ssr';

// Unified per-render context combining SSRContext and RenderContext
export interface RenderContext {
  url: string;
  seed: number;
  data?: SSRData;
  params?: Record<string, string>;
  signal?: AbortSignal;
  // Per-render key state (moved from render-keys.ts globals)
  keyCounter: number;
  renderData: Record<string, unknown> | null;
}

// Legacy alias for compatibility
export type SSRContext = RenderContext;

// AsyncLocalStorage for Node.js concurrency safety
type AsyncLocalStorageType<T> = {
  getStore(): T | undefined;
  run<R>(store: T, fn: () => R): R;
};

let asyncLocalStorage: AsyncLocalStorageType<RenderContext> | null = null;

// Try to load AsyncLocalStorage at module init (Node.js only)
try {
  // Dynamic require to avoid bundler issues in browser builds
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const asyncHooks = require('async_hooks');
  if (asyncHooks?.AsyncLocalStorage) {
    asyncLocalStorage =
      new asyncHooks.AsyncLocalStorage() as AsyncLocalStorageType<RenderContext>;
  }
} catch {
  // Not in Node.js or async_hooks unavailable - use fallback
}

// Fallback stack for non-Node environments
let fallbackStack: RenderContext | null = null;

export function createRenderContext(
  seed = 12345,
  opts: {
    url?: string;
    data?: SSRData;
    params?: Record<string, string>;
    signal?: AbortSignal;
  } = {}
): RenderContext {
  return {
    url: opts.url ?? '',
    seed,
    data: opts.data,
    params: opts.params,
    signal: opts.signal,
    keyCounter: 0,
    renderData: null,
  };
}

/**
 * Run a function with the given render context.
 * Concurrency-safe in Node.js via AsyncLocalStorage.
 */
export function withRenderContext<T>(ctx: RenderContext, fn: () => T): T {
  if (asyncLocalStorage) {
    return asyncLocalStorage.run(ctx, fn);
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
  if (asyncLocalStorage) {
    return asyncLocalStorage.getStore() ?? null;
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
