/**
 * Resource auto-discovery for SSG
 *
 * Phase 1: Simplified version
 * Phase 2: Can be extended to walk component tree and discover resources
 */

import type { RouteConfig, DiscoveredResources } from './types';

/**
 * Discover resources from a dry-run render
 *
 * In phase 1: returns empty map (users supply data manually)
 * In phase 2: walk component tree to find resource() calls
 */
export async function discoverResources(
  _routes: RouteConfig[]
): Promise<Record<string, DiscoveredResources>> {
  // Phase 1: No auto-discovery
  // Just return empty map - users provide data via dataOverrides
  return {};
}
