/**
 * Data resolution for SSG
 *
 * Merges user-supplied data overrides with any auto-discovered resources.
 * In phase 1, primarily handles user-supplied data.
 */

import type { SSRData } from '../common/ssr';
import type { RouteConfig } from './types';

interface DataResolutionOptions {
  /** User-supplied data overrides per route path */
  dataOverrides?: Record<string, unknown>;
}

/**
 * Resolve and validate data for SSG routes
 * Returns a map of route path -> SSRData
 *
 * In phase 1: accepts user-supplied dataOverrides
 * In phase 2: can be extended to auto-discover resources
 */
export function resolveSsgData(
  routes: RouteConfig[],
  options: DataResolutionOptions = {}
): Record<string, SSRData> {
  const { dataOverrides = {} } = options;
  const dataMap: Record<string, SSRData> = {};

  for (const route of routes) {
    // Check if user provided data for this route
    if (route.path in dataOverrides) {
      const data = dataOverrides[route.path];
      if (typeof data !== 'object' || data === null || Array.isArray(data)) {
        throw new Error(
          `data for route "${route.path}" must be an object, got ${typeof data}`
        );
      }
      dataMap[route.path] = data as SSRData;
    }
    // In phase 1, routes without data are rendered with no SSR data
    // Phase 2 can add auto-discovery here
  }

  return dataMap;
}

/**
 * Validate routes are properly configured
 */
export function validateRoutes(routes: RouteConfig[]): void {
  if (!Array.isArray(routes)) {
    throw new Error('routes must be an array');
  }

  if (routes.length === 0) {
    throw new Error('routes array cannot be empty');
  }

  for (const route of routes) {
    if (typeof route.path !== 'string' || !route.path.startsWith('/')) {
      throw new Error(
        `route path must be a string starting with "/", got "${route.path}"`
      );
    }

    if (typeof route.component !== 'function') {
      throw new Error(
        `route component must be a function for path "${route.path}"`
      );
    }
  }
}
