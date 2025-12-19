/**
 * Error handling utilities
 * No framework magic — just JavaScript patterns
 */

import { logger } from '../dev/logger';

/**
 * Safe wrapper for async functions
 * Returns result or error value without throwing
 *
 * Useful for: async operations where you want to handle errors inline
 *
 * @example
 * ```ts
 * const { data, error } = await handle(fetchUser(id));
 * if (error) return renderError(error);
 * return renderData(data);
 * ```
 */
export async function handle<T>(
  promise: Promise<T>
): Promise<{ data: T | null; error: Error | null }> {
  try {
    const data = await promise;
    return { data, error: null };
  } catch (error) {
    return { data: null, error: error as Error };
  }
}

/**
 * Catch errors in async operations and render fallback
 * Returns fallback value if error occurs
 *
 * Useful for: graceful degradation
 *
 * @example
 * ```ts
 * const data = await catchError(
 *   fetchData(),
 *   { type: 'div', children: ['Failed to load'] }
 * );
 * ```
 */
export async function catchError<T>(
  promise: Promise<T>,
  fallback: T
): Promise<T> {
  try {
    return await promise;
  } catch {
    return fallback;
  }
}

/**
 * Try/catch helper with typed error handling
 * Useful for: logging and recovery strategies
 *
 * @example
 * ```ts
 * const result = await tryWithLogging(
 *   () => fetch(url),
 *   { message: 'Failed to fetch', retryable: true }
 * );
 * ```
 */
export async function tryWithLogging<T>(
  fn: () => Promise<T>,
  errorInfo?: { message?: string; retryable?: boolean }
): Promise<T | null> {
  try {
    return await fn();
  } catch (error) {
    const message = errorInfo?.message || 'Operation failed';
    logger.error(message, error);
    return null;
  }
}
