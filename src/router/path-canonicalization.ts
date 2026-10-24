import type { RouteManifest, RouteRecord } from '../common/router';
import { splitPathSegments, decodePathSegment } from './match';
import type { InternalRouteRecord } from './internal-types';

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
 * The pathname a request is canonically matched and served under for a
 * registry's `trailingSlash` and `caseSensitive` options: static segments in
 * the case a non-fallback route declares them (only when `caseSensitive` is
 * `false` and the path matches no route as written), then the trailing-slash
 * policy. Paths that match no non-fallback route keep their spelling, as do
 * registries with neither option. `exact` looks a pathname up in the
 * registry's records.
 */
export function canonicalPathname(
  pathname: string,
  manifest: RouteManifest,
  exact: (pathname: string) => { record: RouteRecord } | null
): string {
  const policy = manifest.trailingSlash;
  const insensitive = manifest.caseSensitive === false;
  if (!policy && !insensitive) return pathname;

  let canonical = pathname;
  const found = exact(pathname);
  if (!found || found.record.isFallback) {
    if (!insensitive) return pathname;
    const corrected = declaredCase(pathname, manifest.records);
    if (corrected === undefined) return pathname;
    canonical =
      pathname.endsWith('/') && corrected !== '/' ? `${corrected}/` : corrected;
  }
  return withTrailingSlash(canonical, policy);
}
