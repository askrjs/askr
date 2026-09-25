/**
 * Path matching, segment parsing, and specificity scoring.
 */

import type { ParsedSegment } from '../common/router';

export function splitPathSegments(path: string): string[] {
  const normalized =
    path.endsWith('/') && path !== '/' ? path.slice(0, -1) : path;

  if (!normalized || normalized === '/') {
    return [];
  }

  const withoutLeadingSlash = normalized.startsWith('/')
    ? normalized.slice(1)
    : normalized;

  return withoutLeadingSlash.length === 0 ? [] : withoutLeadingSlash.split('/');
}

export function normalizeRouteSegmentName(value: string): string {
  return value.trim();
}

/**
 * Parse a route template path into typed segments.
 *
 * @example
 * parseSegments('/users/{id}')  // [{kind:'static',value:'users'},{kind:'param',value:'id'}]
 * parseSegments('/*')           // [{kind:'catchall',value:'*'}]
 * parseSegments('/posts/*')     // [{kind:'static',value:'posts'},{kind:'wildcard',value:'*'}]
 * parseSegments('/files/{*path}') // [{kind:'static',value:'files'},{kind:'splat',value:'path'}]
 */
export function parseSegments(path: string): ParsedSegment[] {
  const normalized =
    path.endsWith('/') && path !== '/' ? path.slice(0, -1) : path;

  const parts = normalized.split('/').filter(Boolean);

  // Bare catch-all: /*
  if (parts.length === 1 && parts[0] === '*') {
    return [{ kind: 'catchall', value: '*' }];
  }

  return parts.map((segment): ParsedSegment => {
    if (segment.startsWith('{') && segment.endsWith('}')) {
      const value = normalizeRouteSegmentName(segment.slice(1, -1));
      if (value.startsWith('*')) {
        return {
          kind: 'splat',
          value: normalizeRouteSegmentName(value.slice(1)),
        };
      }
      return { kind: 'param', value };
    }
    if (segment === '*') {
      return { kind: 'wildcard', value: '*' };
    }
    return { kind: 'static', value: segment };
  });
}

/**
 * Per-segment specificity weights. Routes are compared segment by segment and
 * the first differing segment decides: static > param > wildcard > (end of
 * route) > splat. "End of route" only ever meets a splat at the same position
 * for routes that match the same URL, so an exact route beats an empty splat.
 */
const SEGMENT_WEIGHT: Record<ParsedSegment['kind'], number> = {
  static: 4,
  param: 3,
  wildcard: 2,
  splat: 0,
  // Only ever the sole segment of `/*`, which is ordered separately.
  catchall: 0,
};
const END_OF_ROUTE_WEIGHT = 1;
const RANK_BASE = 8;

function segmentWeight(segment: ParsedSegment | undefined): number {
  if (segment === undefined) return END_OF_ROUTE_WEIGHT;
  return SEGMENT_WEIGHT[segment.kind];
}

function isCatchAll(segments: ParsedSegment[]): boolean {
  return segments.length === 1 && segments[0].kind === 'catchall';
}

/**
 * Order two parsed routes by specificity: negative when `a` is more specific
 * than `b`, positive when less, `0` when they tie (declaration order decides).
 *
 * Segments are compared left to right and the first differing segment decides
 * (static > param > wildcard > splat); the bare `/*` catch-all is always last.
 */
export function compareRouteSpecificity(
  a: ParsedSegment[],
  b: ParsedSegment[]
): number {
  const aCatchAll = isCatchAll(a);
  const bCatchAll = isCatchAll(b);
  if (aCatchAll || bCatchAll) return Number(aCatchAll) - Number(bCatchAll);

  const length = Math.max(a.length, b.length);
  for (let i = 0; i < length; i++) {
    const difference = segmentWeight(b[i]) - segmentWeight(a[i]);
    if (difference !== 0) return difference;
  }
  return 0;
}

/**
 * Compute a numeric specificity rank from a parsed segment list.
 *
 * The rank encodes the segment-by-segment order of
 * {@link compareRouteSpecificity} as base-8 digits (higher = more specific);
 * the bare `/*` catch-all is `-1`. It is informational: route ordering uses
 * `compareRouteSpecificity` so arbitrarily deep routes compare exactly.
 */
export function computeRank(segments: ParsedSegment[]): number {
  if (isCatchAll(segments)) return -1;
  let rank = 0;
  let scale = 1;
  for (const segment of segments) {
    scale /= RANK_BASE;
    rank += segmentWeight(segment) * scale;
  }
  // Remaining positions are "end of route": sum of END weight * scale / 8^k.
  return rank + (END_OF_ROUTE_WEIGHT * scale) / (RANK_BASE - 1);
}

/** Reused frozen empty params object — returned for purely-static (no-capture) routes. */
const emptyParams: Record<string, string> = Object.freeze(
  Object.create(null) as Record<string, string>
);

/** Returned for every failed match — avoids per-call allocation. */
const noMatch: MatchResult = Object.freeze({
  matched: false,
  params: emptyParams,
});

/**
 * Encoded path separators (`/` and backslash) that stay percent-encoded when a URL
 * segment is decoded, so a capture never gains a separator the URL did not
 * have (`..%2F..%2Fetc` must not become `../../etc`).
 */
const ENCODED_SEPARATOR = /(%2F|%5C)/i;

function decodeSegmentPiece(piece: string): string {
  if (!piece.includes('%')) {
    return piece;
  }

  try {
    return decodeURIComponent(piece);
  } catch {
    return piece;
  }
}

/**
 * Decode one URL path segment, keeping encoded separators as upper-case
 * `%2F`/`%5C` and malformed encodings as written.
 */
export function decodePathSegment(part: string): string {
  if (!part.includes('%')) {
    return part;
  }

  // split() with a capture group alternates text and separator pieces.
  return part
    .split(ENCODED_SEPARATOR)
    .map((piece, index) =>
      index % 2 === 1 ? piece.toUpperCase() : decodeSegmentPiece(piece)
    )
    .join('');
}

/**
 * Percent-encode one path segment value, the inverse of
 * {@link decodePathSegment}: kept `%2F`/`%5C` separators pass through so a
 * capture round-trips to the URL it came from.
 */
export function encodePathSegment(value: string): string {
  return value
    .split(ENCODED_SEPARATOR)
    .map((piece, index) =>
      index % 2 === 1 ? piece.toUpperCase() : encodeURIComponent(piece)
    )
    .join('');
}

/**
 * Compare a static route segment with a URL segment. URL parts arrive
 * percent-encoded (`caf%C3%A9`), so decoded forms are compared and `/café`,
 * `/a b` and reserved-character routes match.
 */
export function staticSegmentMatches(value: string, part: string): boolean {
  return value === part || decodePathSegment(value) === decodePathSegment(part);
}

/**
 * Format the `*` capture of a catch-all or fallback from the remaining URL
 * parts, decoding each segment like param and splat captures.
 */
export function formatCatchAllCapture(parts: string[]): string {
  if (parts.length === 0) return '/';
  if (parts.length === 1) return decodePathSegment(parts[0]);
  return '/' + parts.map(decodePathSegment).join('/');
}

/**
 * Match pre-split URL parts against pre-parsed route segments.
 *
 * This is the hot-path matcher used by `resolveRoute` and
 * `resolveRouteFromRoutes`. Callers split the URL path **once** and reuse
 * `urlParts` across all route comparisons in a single resolution call.
 *
 * - Returns a params object (possibly the shared `{}`) on match.
 * - Returns `null` on no match.
 * - Params are allocated lazily — purely-static routes return the frozen
 *   empty sentinel without any heap allocation.
 */
export function matchSegments(
  urlParts: string[],
  segments: ParsedSegment[]
): Record<string, string> | null {
  // catch-all /* — matches every URL at any depth
  if (segments.length === 1 && segments[0].kind === 'catchall') {
    return { '*': formatCatchAllCapture(urlParts) };
  }

  const splatIndex = segments.findIndex((segment) => segment.kind === 'splat');
  if (splatIndex !== -1) {
    if (splatIndex !== segments.length - 1) {
      return null;
    }
    if (urlParts.length < splatIndex) {
      return null;
    }
  } else if (urlParts.length !== segments.length) {
    return null;
  }

  // non-catchall: part count must equal segment count

  // Walk segments; allocate the params object lazily on first capture
  let params: Record<string, string> | null = null;

  const normalizeCapturedSplatParts = (parts: string[]): string[] => {
    let start = 0;
    while (start < parts.length && parts[start] === '') {
      start += 1;
    }

    return start === 0 ? parts : parts.slice(start);
  };

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const part = urlParts[i];
    if (seg.kind === 'static') {
      if (!staticSegmentMatches(seg.value, part)) return null;
    } else if (seg.kind === 'splat') {
      if (params === null) params = {};
      params[seg.value] = normalizeCapturedSplatParts(
        urlParts.slice(i).map(decodePathSegment)
      ).join('/');
      return params;
    } else {
      if (params === null) params = {};
      if (seg.kind === 'param') {
        params[seg.value] = decodePathSegment(part);
      } else {
        // wildcard
        params['*'] = decodePathSegment(part);
      }
    }
  }
  return params ?? emptyParams;
}

export interface MatchResult {
  matched: boolean;
  params: Record<string, string>;
}

/**
 * Match a path against a route pattern and extract params
 *
 * @example
 * match('/users/123', '/users/{id}')
 * // → { matched: true, params: { id: '123' } }
 *
 * match('/posts/hello-world/edit', '/posts/{slug}/{action}')
 * // → { matched: true, params: { slug: 'hello-world', action: 'edit' } }
 *
 * match('/users', '/posts/{id}')
 * // → { matched: false, params: {} }
 */
export function match(path: string, pattern: string): MatchResult {
  // Normalize trailing slashes
  const normalizedPath =
    path.endsWith('/') && path !== '/' ? path.slice(0, -1) : path;
  const normalizedPattern =
    pattern.endsWith('/') && pattern !== '/' ? pattern.slice(0, -1) : pattern;

  const pathSegments = splitPathSegments(normalizedPath);
  const patternSegments = parseSegments(normalizedPattern);
  const params = matchSegments(pathSegments, patternSegments);

  return params === null ? noMatch : { matched: true, params };
}
