/**
 * SSR Context Management
 *
 * Provides context for server-side rendering including:
 * - SSRContext: Full context for sink-based streaming SSR
 * - RenderContext: Lightweight context for sync render passes
 */

import { SSRDataMissingError } from './errors';

export type SSRData = Record<string, unknown>;

/** Full context for sink-based streaming SSR */
export type SSRContext = {
  url: string;
  seed: number;
  data?: SSRData;
  params?: Record<string, string>;
  signal?: AbortSignal;
};

// Stack-scoped SSRContext for sink-based rendering
let current: SSRContext | null = null;

export function getSSRContext(): SSRContext | null {
  return current;
}

export function withSSRContext<T>(ctx: SSRContext, fn: () => T): T {
  const prev = current;
  current = ctx;
  try {
    return fn();
  } finally {
    current = prev;
  }
}

/** Lightweight context for synchronous render passes */
export type RenderContext = {
  seed: number;
};

export function createRenderContext(seed = 12345): RenderContext {
  return { seed };
}

// Stack-scoped RenderContext for sync SSR detection
let currentSSRContext: RenderContext | null = null;

export function getCurrentSSRContext(): RenderContext | null {
  return currentSSRContext;
}

export function runWithSSRContext<T>(ctx: RenderContext, fn: () => T): T {
  const prev = currentSSRContext;
  currentSSRContext = ctx;
  try {
    return fn();
  } finally {
    currentSSRContext = prev;
  }
}

/**
 * Centralized SSR enforcement helper — throws a consistent error when async
 * data is encountered during synchronous SSR.
 */
export function throwSSRDataMissing(): never {
  throw new SSRDataMissingError();
}

export { SSRDataMissingError };
