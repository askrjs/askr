import type {
  AccessRedirectDecision,
  RouteManifest,
  RouteRecord,
} from '../common/router';
import { splitPathSegments, decodePathSegment } from './match';
import { parseLocation } from './route-context';
import { getMatchingRouteRecord } from './route-matching';
import { redirectDecision } from './policy';
import type { InternalRouteRecord } from './internal-types';

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

function sameSegment(declared: string, part: string): boolean {
  return (
    declared === part ||
    decodePathSegment(declared).toLowerCase() ===
      decodePathSegment(part).toLowerCase()
  );
}

/**
 * The path with its static segments in the case a non-fallback route declares
 * them, when only a case-insensitive comparison of static segments matches
 * that route. Parameter and capture text keeps the URL's own case.
 */
function declaredCase(
  pathname: string,
  records: readonly RouteRecord[]
): string | undefined {
  const parts = splitPathSegments(pathname);
  for (const record of records) {
    if ((record as InternalRouteRecord).fallbackPrefix) continue;
    const { segments } = record;
    if (segments.length === 1 && segments[0]!.kind === 'catchall') continue;
    const splat = segments.findIndex((segment) => segment.kind === 'splat');
    if (
      splat === -1 ? parts.length !== segments.length : parts.length < splat
    ) {
      continue;
    }
    const corrected: string[] = [];
    let matched = true;
    for (let index = 0; index < segments.length && matched; index += 1) {
      const segment = segments[index]!;
      const part = parts[index]!;
      if (segment.kind === 'static') {
        matched = sameSegment(segment.value, part);
        corrected.push(segment.value);
      } else if (segment.kind === 'splat') {
        corrected.push(...parts.slice(index));
        break;
      } else {
        matched = part !== '';
        corrected.push(part);
      }
    }
    if (matched) return `/${corrected.join('/')}`;
  }
  return undefined;
}

function withTrailingSlash(
  pathname: string,
  policy: RouteManifest['trailingSlash']
): string {
  if (pathname === '/' || !policy) return pathname;
  const stripped = pathname.replace(/\/+$/, '') || '/';
  if (policy === 'never') return stripped;
  const last = stripped.slice(stripped.lastIndexOf('/') + 1);
  // `/files/report.pdf/` names no file: leave file-like paths alone.
  return last.includes('.') ? pathname : `${stripped}/`;
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
  const policy = manifest.trailingSlash;
  const insensitive = manifest.caseSensitive === false;
  if (!policy && !insensitive) return null;

  const { pathname, search, hash } = parseLocation(logicalTarget);
  let canonical = pathname;
  const exact = getMatchingRouteRecord(pathname, manifest.records);
  if (!exact || exact.record.isFallback) {
    if (!insensitive) return null;
    const corrected = declaredCase(pathname, manifest.records);
    if (corrected === undefined) return null;
    canonical =
      pathname.endsWith('/') && corrected !== '/' ? `${corrected}/` : corrected;
  }
  canonical = withTrailingSlash(canonical, policy);
  if (canonical === pathname) return null;
  // Not a replace: a navigation that arrives here keeps the entry it started
  // from, and the browser boot path replaces its own entry regardless.
  return redirectDecision(`${canonical}${search}${hash}`, {
    status: 308,
    replace: false,
  });
}
