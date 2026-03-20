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
  if (segments.length === 1 && segments[0].kind === 'catchall') return 0;
  let score = 0;
  for (const seg of segments) {
    if (seg.kind === 'static') score += 3;
    else if (seg.kind === 'param') score += 2;
    else if (seg.kind === 'wildcard') score += 1;
    // catchall contributes 0
  }
  return score;
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
        '*': pathSegments.length > 1 ? normalizedPath : pathSegments[0],
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
      params[paramName] = decodeURIComponent(pathSegment);
    } else if (patternSegment === '*') {
      // Wildcard: match single segment
      params['*'] = pathSegment;
    } else if (patternSegment !== pathSegment) {
      // Literal segment mismatch
      return { matched: false, params: {} };
    }
  }

  return { matched: true, params };
}
