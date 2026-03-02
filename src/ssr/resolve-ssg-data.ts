/**
 * Data Resolution for SSG
 *
 * Merges auto-discovered resources with user-supplied data overrides.
 * Validates that required data is available for rendering.
 */

import type { SSRData } from '../common/ssr';
import type { DiscoveredResources } from './discover-resources';

/**
 * Merge auto-discovered resources with user-supplied data overrides.
 *
 * User-supplied data takes precedence over auto-discovered metadata.
 * Currently, since auto-discovery is not fully implemented, this mostly
 * passes through the user overrides.
 *
 * @param discovered Auto-discovered resources (from dry-run)
 * @param userOverrides User-supplied data
 * @returns Merged SSRData
 */
export function resolveSSGData(
  discovered: DiscoveredResources | null,
  userOverrides?: Record<string, unknown>
): SSRData {
  const result: SSRData = { ...userOverrides };

  // Future: merge discovered resources with user overrides
  // For now, user overrides are the primary source

  return result;
}

/**
 * Validate that all required data is available.
 *
 * @param data Resolved data
 * @param required Set of required resource keys
 * @throws Error if required data is missing
 */
export function validateSSGData(
  data: SSRData,
  required?: Set<string>
): void {
  if (!required || required.size === 0) {
    return;
  }

  const missing: string[] = [];
  for (const key of required) {
    if (!(key in data)) {
      missing.push(key);
    }
  }

  if (missing.length > 0) {
    throw new Error(
      `SSG data validation failed: missing required keys: ${missing.join(', ')}`
    );
  }
}
