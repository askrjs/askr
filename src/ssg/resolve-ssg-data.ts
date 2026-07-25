/**
 * Data resolution for SSG
 *
 * Merges user-supplied data overrides with any auto-discovered resources.
 * In phase 1, primarily handles user-supplied data.
 */

import type { SSRData } from '../common/ssr';
import type { RouteConfig } from './types';
import { interpolateRoutePath } from './route-utils';

interface DataResolutionOptions {
  /** User-supplied data overrides per route path */
  dataOverrides?: Record<string, unknown>;
}

export interface ResolvedSsgRouteData {
  hasData: boolean;
  data?: SSRData;
}

function hasOwnRouteData(
  dataMap: Record<string, SSRData>,
  path: string
): boolean {
  return Object.prototype.hasOwnProperty.call(dataMap, path);
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
    const concretePath = interpolateRoutePath(route.path, route.params);
    const overridePath =
      concretePath in dataOverrides
        ? concretePath
        : route.path in dataOverrides
          ? route.path
          : null;

    // Check if user provided data for this route
    if (overridePath) {
      const data = dataOverrides[overridePath];
      if (typeof data !== 'object' || data === null || Array.isArray(data)) {
        throw new Error(
          `data for route "${overridePath}" must be an object, got ${typeof data}`
        );
      }
      dataMap[overridePath] = data as SSRData;
    }
    // In phase 1, routes without data are rendered with no SSR data
    // Phase 2 can add auto-discovery here
  }

  return dataMap;
}

export function resolveSsgRouteData(
  dataMap: Record<string, SSRData>,
  routePath: string,
  concretePath: string
): ResolvedSsgRouteData {
  if (hasOwnRouteData(dataMap, concretePath)) {
    return {
      hasData: true,
      data: dataMap[concretePath],
    };
  }

  if (hasOwnRouteData(dataMap, routePath)) {
    return {
      hasData: true,
      data: dataMap[routePath],
    };
  }

  return {
    hasData: false,
    data: undefined,
  };
}

function isStringRecord(value: unknown): value is Record<string, string> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }

  for (const recordValue of Object.values(value)) {
    if (typeof recordValue !== 'string') {
      return false;
    }
  }

  return true;
}

function validateRouteShape(route: RouteConfig): void {
  if (typeof route.path !== 'string' || !route.path.startsWith('/')) {
    throw new Error(
      `route path must be a string starting with "/", got "${route.path}"`
    );
  }

  if (typeof route.handler !== 'function') {
    throw new Error(
      `route handler must be a function for path "${route.path}"`
    );
  }

  if (route.params !== undefined && !isStringRecord(route.params)) {
    throw new Error(
      `route "${route.path}" params must be an object containing only string values`
    );
  }

  if (route.invalidationKeys !== undefined) {
    if (!Array.isArray(route.invalidationKeys)) {
      throw new Error(
        `route "${route.path}" invalidationKeys must be an array of strings`
      );
    }
    for (const key of route.invalidationKeys) {
      if (typeof key !== 'string' || key.length === 0) {
        throw new Error(
          `route "${route.path}" invalidationKeys must contain only non-empty strings`
        );
      }
    }
  }
}

function validateEntriesResult(
  route: RouteConfig,
  entries: unknown
): Array<Record<string, string>> {
  if (!Array.isArray(entries)) {
    throw new Error(
      `route "${route.path}" entries must return an array of param maps`
    );
  }

  return entries.map((entry, index) => {
    if (!isStringRecord(entry)) {
      throw new Error(
        `route "${route.path}" entries[${index}] must be an object containing only string values`
      );
    }

    return entry;
  });
}

export async function expandRoutes(
  routes: RouteConfig[]
): Promise<RouteConfig[]> {
  if (!Array.isArray(routes)) {
    throw new Error('routes must be an array');
  }

  const expanded: RouteConfig[] = [];

  for (const route of routes) {
    validateRouteShape(route);

    if (route.params) {
      expanded.push({ ...route, entries: undefined });
    }

    if (!route.entries) {
      if (!route.params) {
        expanded.push(route);
      }
      continue;
    }

    const entries = validateEntriesResult(route, await route.entries());
    for (const params of entries) {
      expanded.push({ ...route, params, entries: undefined });
    }
  }

  return expanded;
}

/**
 * Validate routes are properly configured
 */
export function validateRoutes(routes: RouteConfig[]): void {
  if (!Array.isArray(routes)) {
    throw new Error('routes must be an array');
  }

  const seen = new Set<string>();

  for (const route of routes) {
    validateRouteShape(route);

    const key = `${route.path}::${JSON.stringify(route.params || {})}`;
    if (seen.has(key)) {
      throw new Error(
        `duplicate route entry detected for path "${route.path}"`
      );
    }
    seen.add(key);

    if (route.path.includes('{')) {
      const paramNames = Array.from(route.path.matchAll(/\{([^}]+)\}/g)).map(
        (m) => m[1]
      );
      if (!route.params) {
        throw new Error(
          `route "${route.path}" uses path parameters and requires params`
        );
      }
      for (const name of paramNames) {
        if (!(name in route.params)) {
          throw new Error(
            `route "${route.path}" missing required param "${name}"`
          );
        }
      }
    }
  }
}
