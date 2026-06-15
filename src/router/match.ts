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
 * Compute a numeric specificity rank from a parsed segment list.
 *
 * Scoring: static = 3, param = 2, wildcard = 1, catchall = 0.
 * Higher rank wins when multiple routes match the same path.
 */
export function computeRank(segments: ParsedSegment[]): number {
  if (segments.length === 1 && segments[0].kind === 'catchall') return -1;
  let score = 0;
  for (const seg of segments) {
    if (seg.kind === 'static') score += 3;
    else if (seg.kind === 'param') score += 2;
    else if (seg.kind === 'wildcard') score += 1;
    else if (seg.kind === 'splat') score -= 0.5;
    // catchall contributes 0 per segment but is handled above
  }
  return score;
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

function decodeRouteParam(part: string): string {
  if (!part.includes('%')) {
    return part;
  }

  try {
    return decodeURIComponent(part);
  } catch {
    return part;
  }
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
    return {
      '*':
        urlParts.length === 0
          ? '/'
          : urlParts.length === 1
            ? urlParts[0]
            : '/' + urlParts.join('/'),
    };
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
      if (seg.value !== part) return null;
    } else if (seg.kind === 'splat') {
      if (params === null) params = {};
      params[seg.value] = normalizeCapturedSplatParts(
        urlParts.slice(i).map(decodeRouteParam)
      ).join('/');
      return params;
    } else {
      if (params === null) params = {};
      if (seg.kind === 'param') {
        params[seg.value] = decodeRouteParam(part);
      } else {
        // wildcard
        params['*'] = part;
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
