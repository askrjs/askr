/**
 * Path matching, segment parsing, and specificity scoring.
 */

import type { ParsedSegment } from '../common/router';

/**
 * Parse a route template path into typed segments.
 *
 * @example
 * parseSegments('/users/{id}')  // [{kind:'static',value:'users'},{kind:'param',value:'id'}]
 * parseSegments('/*')           // [{kind:'catchall',value:'*'}]
 * parseSegments('/posts/*')     // [{kind:'static',value:'posts'},{kind:'wildcard',value:'*'}]
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
      return { kind: 'param', value: segment.slice(1, -1) };
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

  // non-catchall: part count must equal segment count
  if (urlParts.length !== segments.length) return null;

  // Walk segments; allocate the params object lazily on first capture
  let params: Record<string, string> | null = null;
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const part = urlParts[i];
    if (seg.kind === 'static') {
      if (seg.value !== part) return null;
    } else {
      if (params === null) params = {};
      if (seg.kind === 'param') {
        // Avoid decodeURIComponent when no percent-encoding is present
        params[seg.value] = part.includes('%')
          ? decodeURIComponent(part)
          : part;
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

  // Split into segments
  const pathSegments = normalizedPath.split('/').filter(Boolean);
  const patternSegments = normalizedPattern.split('/').filter(Boolean);

  // Support catch-all route: /* matches any path at any depth
  if (patternSegments.length === 1 && patternSegments[0] === '*') {
    // For multi-segment paths, preserve the leading slash
    // For single-segment paths, return just the segment
    return {
      matched: true,
      params: {
        '*':
          pathSegments.length === 0
            ? '/'
            : pathSegments.length > 1
              ? normalizedPath
              : pathSegments[0],
      },
    };
  }

  // Check if lengths match (wildcard segments still need to match one segment)
  if (pathSegments.length !== patternSegments.length) {
    return { matched: false, params: {} };
  }

  const params: Record<string, string> = {};

  // Match each segment
  for (let i = 0; i < patternSegments.length; i++) {
    const patternSegment = patternSegments[i];
    const pathSegment = pathSegments[i];

    // Parameter: {paramName}
    if (patternSegment.startsWith('{') && patternSegment.endsWith('}')) {
      const paramName = patternSegment.slice(1, -1);
      params[paramName] = pathSegment.includes('%')
        ? decodeURIComponent(pathSegment)
        : pathSegment;
    } else if (patternSegment === '*') {
      // Wildcard: match single segment
      params['*'] = pathSegment;
    } else if (patternSegment !== pathSegment) {
      // Literal segment mismatch
      return noMatch;
    }
  }

  return { matched: true, params };
}
