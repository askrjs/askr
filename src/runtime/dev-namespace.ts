/**
 * Dev-only namespace helpers for diagnostics
 *
 * Centralizes the repetitive globalThis.__ASKR__ access pattern
 * used throughout runtime for dev-mode diagnostics.
 */

type DevNamespace = Record<string, unknown>;

/**
 * Get or create the __ASKR__ dev namespace on globalThis.
 * Returns empty object in production to avoid allocations.
 */
export function getDevNamespace(): DevNamespace {
  if (process.env.NODE_ENV === 'production') return {};
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
  if (process.env.NODE_ENV === 'production') return;
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
  if (process.env.NODE_ENV === 'production') return undefined;
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
  if (process.env.NODE_ENV === 'production') return;
  try {
    delete getDevNamespace()[key];
  } catch {
    // ignore
  }
}
