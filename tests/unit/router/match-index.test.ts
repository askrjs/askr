import { describe, expect, it } from 'vite-plus/test';
import {
  createRouteRegistry,
  fallback,
  matchRoute,
  page,
  route,
} from '@askrjs/askr/router';
import {
  decodePathSegment,
  formatCatchAllCapture,
  matchSegments,
  splitPathSegments,
} from '../../../src/router/match';
import type { RouteRecord } from '../../../src/common/router';

/**
 * The indexed matcher must answer exactly like a scan of the specificity
 * sorted record list. This oracle is that scan; the registries are built
 * from a seeded generator so the comparison covers encoded segments, params,
 * wildcards, splats, catch-alls, fallbacks, misses and odd slashes.
 */
function oracle(
  pathname: string,
  records: readonly RouteRecord[]
): { path: string; params: Record<string, string> } | null {
  const normalized =
    pathname.endsWith('/') && pathname !== '/'
      ? pathname.slice(0, -1)
      : pathname;
  const parts = splitPathSegments(pathname);
  for (const record of records) {
    if ((record as { fallbackPrefix?: string }).fallbackPrefix) continue;
    const params = matchSegments(parts, record.segments);
    if (params !== null) return { path: record.path, params: { ...params } };
  }
  // Scoped fallbacks: deepest prefix, then declaration order among equals.
  let best: {
    path: string;
    params: Record<string, string>;
    depth: number;
  } | null = null;
  for (const record of records) {
    const prefix = (record as { fallbackPrefix?: string }).fallbackPrefix;
    if (!prefix) continue;
    const prefixParts = splitPathSegments(prefix);
    const urlParts = splitPathSegments(normalized);
    if (urlParts.length < prefixParts.length) continue;
    const prefixSegments = record.segments.slice(0, prefixParts.length);
    const params = matchSegments(
      urlParts.slice(0, prefixParts.length),
      prefixSegments
    );
    if (params === null) continue;
    if (best === null || prefixParts.length > best.depth) {
      best = {
        path: record.path,
        params: {
          ...params,
          '*': formatCatchAllCapture(urlParts.slice(prefixParts.length)),
        },
        depth: prefixParts.length,
      };
    }
  }
  return best ? { path: best.path, params: best.params } : null;
}

function lcg(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

const STATIC = ['users', 'docs', 'caf%C3%A9', 'cafe', 'a', 'b', 'item-1'];

function buildRegistry(
  random: () => number,
  count: number,
  options: Parameters<typeof createRouteRegistry>[1] = {},
  statics: readonly string[] = STATIC
) {
  const paths = new Set<string>();
  return createRouteRegistry(() => {
    route('/', () => null);
    for (let index = 0; index < count; index += 1) {
      const depth = 1 + Math.floor(random() * 4);
      const segments: string[] = [];
      for (let level = 0; level < depth; level += 1) {
        const roll = random();
        if (roll < 0.55)
          segments.push(statics[Math.floor(random() * statics.length)]);
        else if (roll < 0.8) segments.push(`{p${level}}`);
        else if (roll < 0.9) segments.push('*');
        else if (level === depth - 1) segments.push('{*rest}');
        else segments.push(statics[0]);
      }
      const path = `/${segments.join('/')}`;
      // The root and `/docs` fallbacks own `/*` and `/docs/*`; a bare splat
      // or wildcard there would collide with them.
      if (paths.has(path) || /^\/(?:docs\/)?(?:\*|\{\*rest\})$/.test(path))
        continue;
      try {
        route(path, () => null);
        paths.add(path);
      } catch {
        // Duplicate match shape for an existing route; skip it.
      }
    }
    page(
      '/docs',
      () => null,
      () => {
        fallback(() => null);
      }
    );
    fallback(() => null);
  }, options);
}

function buildUrls(
  random: () => number,
  count: number,
  pieces: readonly string[] = [...STATIC, '42', 'x%20y', 'caf%C3%A9']
): string[] {
  const urls = ['/', '/users/', '/users//', '/caf%C3%A9/a', '/cafe/b/c/d/e'];
  for (let index = 0; index < count; index += 1) {
    const depth = Math.floor(random() * 5);
    const parts: string[] = [];
    for (let level = 0; level < depth; level += 1) {
      parts.push(pieces[Math.floor(random() * pieces.length)]);
    }
    let url = `/${parts.join('/')}`;
    if (url !== '/' && random() < 0.15) url += '/';
    urls.push(url);
  }
  return urls;
}

const MIXED_CASE = ['Users', 'DOCS', 'Caf%C3%A9', 'cafe', 'a', 'B', 'Item-1'];
const MIXED_PIECES = [
  ...MIXED_CASE,
  'users',
  'docs',
  'USERS',
  'caf%c3%a9',
  'CAFE',
  'b',
  'item-1',
  '42',
  'X%20y',
];

/**
 * With `caseSensitive: false` a path that matches a route as written keeps
 * that match (resolution only redirects paths that match nothing); otherwise
 * a route matches when its static segments equal the URL's ignoring case,
 * and parameter text keeps the URL's own case. Scoped fallbacks keep matching
 * their prefix as written. This oracle is a scan of the sorted records.
 */
function insensitiveOracle(
  pathname: string,
  records: readonly RouteRecord[]
): { path: string; params: Record<string, string> } | null {
  const parts = splitPathSegments(pathname);
  const fold = (value: string) => decodePathSegment(value).toLowerCase();
  const routes = records.filter(
    (record) => !(record as { fallbackPrefix?: string }).fallbackPrefix
  );
  for (const record of routes) {
    const params = matchSegments(parts, record.segments);
    if (params !== null) return { path: record.path, params: { ...params } };
  }
  for (const record of routes) {
    // Re-spell the URL with the route's own static segments, then match.
    const respelled = parts.map((part, index) => {
      const segment = record.segments[index];
      return segment?.kind === 'static' && fold(segment.value) === fold(part)
        ? segment.value
        : part;
    });
    const params = matchSegments(respelled, record.segments);
    if (params !== null) return { path: record.path, params: { ...params } };
  }
  return oracle(
    pathname,
    records.filter(
      (record) => (record as { fallbackPrefix?: string }).fallbackPrefix
    )
  );
}

describe('indexed route matching', () => {
  it('should match exactly like a scan of the sorted records', () => {
    for (let seed = 1; seed <= 12; seed += 1) {
      const random = lcg(seed * 7919);
      const registry = buildRegistry(random, 40 + seed * 10);
      const records = registry.manifest.records;
      for (const url of buildUrls(random, 120)) {
        const expected = oracle(url, records);
        const actual = matchRoute(url, { registry });
        const summary = actual
          ? { path: actual.path, params: { ...actual.params } }
          : null;
        expect(summary, `seed ${seed} url ${url}`).toEqual(expected);
      }
    }
  });

  it('should return a matched route after a more specific one is registered later', () => {
    const registry = createRouteRegistry(() => {
      route('/users/{id}', () => null);
    });
    expect(matchRoute('/users/me', { registry })?.path).toBe('/users/{id}');
    const grown = createRouteRegistry(() => {
      route('/users/{id}', () => null);
      route('/users/me', () => null);
    });
    expect(matchRoute('/users/me', { registry: grown })?.path).toBe(
      '/users/me'
    );
    expect(matchRoute('/users/me', { registry })?.path).toBe('/users/{id}');
  });

  it('should match case-insensitively like a scan when caseSensitive is false', () => {
    for (const trailingSlash of [undefined, 'never', 'always'] as const) {
      for (let seed = 1; seed <= 8; seed += 1) {
        const random = lcg(seed * 104729);
        const registry = buildRegistry(
          random,
          40 + seed * 10,
          { caseSensitive: false, trailingSlash },
          MIXED_CASE
        );
        const records = registry.manifest.records;
        for (const url of buildUrls(random, 120, MIXED_PIECES)) {
          // A policy rewrites runs of trailing slashes to one canonical form.
          if (trailingSlash && url.endsWith('//')) continue;
          const expected = insensitiveOracle(url, records);
          const actual = matchRoute(url, { registry });
          const summary = actual
            ? { path: actual.path, params: { ...actual.params } }
            : null;
          expect(summary, `seed ${seed} ${trailingSlash} url ${url}`).toEqual(
            expected
          );
        }
      }
    }
  });

  it('should leave the case-sensitive default unchanged', () => {
    const registry = createRouteRegistry(() => {
      route('/about', () => null);
    });
    expect(matchRoute('/ABOUT', { registry })).toBeNull();
    expect(matchRoute('/about/', { registry })?.path).toBe('/about');
  });
});
