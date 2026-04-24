/**
 * Dev-only namespace helpers for diagnostics
 *
 * Centralizes the repetitive globalThis.__ASKR__ access pattern
 * used throughout runtime for dev-mode diagnostics.
 */

import { isProductionEnvironment } from '../common/env';

type DevNamespace = Record<string, unknown>;

/**
 * Get or create the __ASKR__ dev namespace on globalThis.
 * Returns empty object in production to avoid allocations.
 */
export function getDevNamespace(): DevNamespace {
  if (isProductionEnvironment()) return {};
  try {
    const g = globalThis as unknown as Record<string, DevNamespace>;
    if (!g.__ASKR__) g.__ASKR__ = {};
    return g.__ASKR__;
  } catch {
    return {};
  }
}

/**
 * Set a value in the dev namespace (no-op in production).
 */
export function setDevValue(key: string, value: unknown): void {
  if (isProductionEnvironment()) return;
  try {
    getDevNamespace()[key] = value;
  } catch {
    // ignore
  }
}

/**
 * Get a value from the dev namespace (returns undefined in production).
 */
export function getDevValue<T>(key: string): T | undefined {
  if (isProductionEnvironment()) return undefined;
  try {
    return getDevNamespace()[key] as T | undefined;
  } catch {
    return undefined;
  }
}

/**
 * Delete a value from the dev namespace (no-op in production).
 */
export function deleteDevValue(key: string): void {
  if (isProductionEnvironment()) return;
  try {
    delete getDevNamespace()[key];
  } catch {
    // ignore
  }
}

/**
 * Increment a counter in the dev namespace (no-op in production).
 * Safely handles non-number values by resetting to 1.
 */
export function incDevCounter(key: string): void {
  if (isProductionEnvironment()) return;
  try {
    const ns = getDevNamespace();
    const prev = typeof ns[key] === 'number' ? (ns[key] as number) : 0;
    ns[key] = prev + 1;
  } catch {
    // ignore
  }
}
