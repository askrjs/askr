/**
 * Dev-only namespace helpers for diagnostics
 *
 * Centralizes the repetitive globalThis.__ASKR__ access pattern
 * used throughout runtime for dev-mode diagnostics.
 */

import { isProductionEnvironment } from '../../common/env';

declare const __ASKR_DEVELOPMENT_BUILD__: boolean;

type DevNamespace = Record<string, unknown>;

// Resolve the build's default mode once. Production bundles bind the helpers
// below directly to no-op implementations, while development/test builds keep
// the runtime environment check used by tests that exercise prod fallbacks.
const PRODUCTION_BUILD_ENABLED = !__ASKR_DEVELOPMENT_BUILD__;
const EMPTY_DEV_NAMESPACE: DevNamespace = {};

function getOrCreateDevNamespace(): DevNamespace {
  try {
    const g = globalThis as unknown as Record<string, DevNamespace>;
    if (!g.__ASKR__) g.__ASKR__ = {};
    return g.__ASKR__;
  } catch {
    return EMPTY_DEV_NAMESPACE;
  }
}

function getDevNamespaceLive(): DevNamespace {
  if (isProductionEnvironment()) return EMPTY_DEV_NAMESPACE;
  return getOrCreateDevNamespace();
}

function setDevValueLive(key: string, value: unknown): void {
  if (isProductionEnvironment()) return;
  try {
    getOrCreateDevNamespace()[key] = value;
  } catch {
    // ignore
  }
}

function getDevValueLive<T>(key: string): T | undefined {
  if (isProductionEnvironment()) return undefined;
  try {
    return getOrCreateDevNamespace()[key] as T | undefined;
  } catch {
    return undefined;
  }
}

function deleteDevValueLive(key: string): void {
  if (isProductionEnvironment()) return;
  try {
    delete getOrCreateDevNamespace()[key];
  } catch {
    // ignore
  }
}

function incDevCounterLive(key: string): void {
  if (isProductionEnvironment()) return;
  try {
    const ns = getOrCreateDevNamespace();
    const prev = typeof ns[key] === 'number' ? (ns[key] as number) : 0;
    ns[key] = prev + 1;
  } catch {
    // ignore
  }
}

/**
 * Get or create the __ASKR__ dev namespace on globalThis.
 * Returns empty object in production to avoid allocations.
 */
export const getDevNamespace: () => DevNamespace = PRODUCTION_BUILD_ENABLED
  ? () => EMPTY_DEV_NAMESPACE
  : getDevNamespaceLive;

/**
 * Set a value in the dev namespace (no-op in production).
 */
export const setDevValue: (key: string, value: unknown) => void =
  PRODUCTION_BUILD_ENABLED ? () => {} : setDevValueLive;

/**
 * Get a value from the dev namespace (returns undefined in production).
 */
export const getDevValue: <T>(key: string) => T | undefined =
  PRODUCTION_BUILD_ENABLED ? () => undefined : getDevValueLive;

/**
 * Delete a value from the dev namespace (no-op in production).
 */
export const deleteDevValue: (key: string) => void = PRODUCTION_BUILD_ENABLED
  ? () => {}
  : deleteDevValueLive;

/**
 * Increment a counter in the dev namespace (no-op in production).
 * Safely handles non-number values by resetting to 1.
 */
export const incDevCounter: (key: string) => void = PRODUCTION_BUILD_ENABLED
  ? () => {}
  : incDevCounterLive;
