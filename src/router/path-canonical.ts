import type { AccessRedirectDecision, RouteManifest } from '../common/router';
import { canonicalPathname } from './path-canonicalization';
import { parseLocation } from './route-context';
import { getMatchingRouteRecord } from './route-matching';
import { redirectDecision } from './policy';

const TRAILING_SLASH_POLICIES = new Set(['ignore', 'never', 'always']);

/** Reject unknown `trailingSlash` and non-boolean `caseSensitive` registry options. */
export function validatePathPolicyOptions(options: {
  trailingSlash?: unknown;
  caseSensitive?: unknown;
}): void {
  if (
    options.trailingSlash !== undefined &&
    !TRAILING_SLASH_POLICIES.has(options.trailingSlash as string)
  ) {
    throw new TypeError(
      `createRouteRegistry trailingSlash must be 'ignore', 'never' or 'always'; got ${String(options.trailingSlash)}.`
    );
  }
  if (
    options.caseSensitive !== undefined &&
    typeof options.caseSensitive !== 'boolean'
  ) {
    throw new TypeError('createRouteRegistry caseSensitive must be a boolean.');
  }
}

/**
 * The redirect that sends a request to its canonical path under the
 * registry's `trailingSlash` and `caseSensitive` options, or `null` when the
 * path is already canonical, matches no non-fallback route, or neither option
 * is set. Redirects keep the query and fragment and carry status 308; a
 * client navigation follows one as a push, so Back returns to where it began.
 */
export function canonicalPathRedirect(
  logicalTarget: string,
  manifest: RouteManifest
): AccessRedirectDecision | null {
  if (!manifest.trailingSlash && manifest.caseSensitive !== false) return null;
  const { pathname, search, hash } = parseLocation(logicalTarget);
  const canonical = canonicalPathname(pathname, manifest, (path) =>
    getMatchingRouteRecord(path, manifest.records)
  );
  if (canonical === pathname) return null;
  // Not a replace: a navigation that arrives here keeps the entry it started
  // from, and the browser boot path replaces its own entry regardless.
  return redirectDecision(`${canonical}${search}${hash}`, {
    status: 308,
    replace: false,
  });
}
