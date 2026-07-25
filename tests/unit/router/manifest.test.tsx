/**
 * tests/router/manifest.test.tsx
 *
 * Validates the normalized route manifest produced by grouped route
 * declarations and the invariants required by SPA/SSR/SSG consumers.
 */

import { describe, it, expect, beforeEach } from 'vite-plus/test';
import {
  route,
  fallback,
  group,
  index,
  createRouteRegistry,
  page,
  resolveRoute,
  resolveRouteFromRoutes,
  _applyManifest,
} from '../../../src/router/route';
import { parseSegments, computeRank } from '../../../src/router/match';
import {
  clearRouteState,
  getRouteList,
  getRouteRecords,
} from '../../../src/router/store';

const currentManifest = () => ({ records: [...getRouteRecords()] });

beforeEach(() => {
  clearRouteState();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// parseSegments()
// ---------------------------------------------------------------------------

describe('parseSegments()', () => {
  it('should parse a static path', () => {
    expect(parseSegments('/settings')).toEqual([
      { kind: 'static', value: 'settings' },
    ]);
  });

  it('should parse a param segment', () => {
    expect(parseSegments('/posts/{slug}')).toEqual([
      { kind: 'static', value: 'posts' },
      { kind: 'param', value: 'slug' },
    ]);
  });

  it('should parse multiple params', () => {
    const segs = parseSegments('/users/{userId}/posts/{postId}');
    expect(segs).toEqual([
      { kind: 'static', value: 'users' },
      { kind: 'param', value: 'userId' },
      { kind: 'static', value: 'posts' },
      { kind: 'param', value: 'postId' },
    ]);
  });

  it('should parse a wildcard segment', () => {
    expect(parseSegments('/files/*')).toEqual([
      { kind: 'static', value: 'files' },
      { kind: 'wildcard', value: '*' },
    ]);
  });

  it('should parse a named splat segment', () => {
    expect(parseSegments('/files/{*path}')).toEqual([
      { kind: 'static', value: 'files' },
      { kind: 'splat', value: 'path' },
    ]);
  });

  it('should trim whitespace inside named splat and param segments', () => {
    expect(parseSegments('/files/{* path }')).toEqual([
      { kind: 'static', value: 'files' },
      { kind: 'splat', value: 'path' },
    ]);
    expect(parseSegments('/files/{ path }')).toEqual([
      { kind: 'static', value: 'files' },
      { kind: 'param', value: 'path' },
    ]);
  });

  it('should parse a catch-all /*', () => {
    expect(parseSegments('/*')).toEqual([{ kind: 'catchall', value: '*' }]);
  });

  it('should normalize trailing slash', () => {
    expect(parseSegments('/users/')).toEqual([
      { kind: 'static', value: 'users' },
    ]);
  });
});

describe('createRouteRegistry()', () => {
  it('should capture routes without mutating the module-level route store', () => {
    route('/legacy', () => 'legacy');

    const registry = createRouteRegistry(() => {
      route('/registry', () => 'registry');
    });

    expect(registry.routes.map((entry) => entry.path)).toEqual(['/registry']);
    expect(registry.manifest.records.map((record) => record.path)).toEqual([
      '/registry',
    ]);
    expect(getRouteList().map((entry) => entry.path)).toEqual(['/legacy']);
    expect(currentManifest().records.map((record) => record.path)).toEqual([
      '/legacy',
    ]);
  });
});

// ---------------------------------------------------------------------------
// computeRank()
// ---------------------------------------------------------------------------

describe('computeRank()', () => {
  it('should score catch-all as -1', () => {
    expect(computeRank([{ kind: 'catchall', value: '*' }])).toBe(-1);
  });

  it('should score wildcard as 1', () => {
    expect(computeRank([{ kind: 'wildcard', value: '*' }])).toBe(1);
  });

  it('should score param as 2', () => {
    expect(computeRank([{ kind: 'param', value: 'id' }])).toBe(2);
  });

  it('should score static as 3', () => {
    expect(computeRank([{ kind: 'static', value: 'users' }])).toBe(3);
  });

  it('should sum multi-segment paths', () => {
    // /users/{id} → static(3) + param(2) = 5
    expect(
      computeRank([
        { kind: 'static', value: 'users' },
        { kind: 'param', value: 'id' },
      ])
    ).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// Route registration path validation
// ---------------------------------------------------------------------------

describe('path validation', () => {
  it('should reject paths without leading /', () => {
    expect(() => route('no-slash', () => null)).toThrow(/must begin with/i);
  });

  it('should reject Express-style :param syntax', () => {
    expect(() => route('/users/:id', () => null)).toThrow(
      /\{name\} interpolation/i
    );
  });

  it('should suggest corrected path in error message', () => {
    let msg = '';
    try {
      route('/posts/:slug/edit', () => null);
    } catch (e) {
      msg = String(e);
    }
    expect(msg).toContain('/posts/{slug}/edit');
  });

  it('should accept valid paths with {param}', () => {
    expect(() => route('/posts/{slug}', () => null)).not.toThrow();
  });

  it('should accept catch-all /*', () => {
    expect(() => route('/*', () => null)).not.toThrow();
  });

  it('should reject empty parameter names', () => {
    expect(() => route('/posts/{}', () => null)).toThrow(/parameter name/i);
  });

  it('should reject malformed brace syntax in route params', () => {
    expect(() => route('/posts/{slug', () => null)).toThrow(/parameter/i);
    expect(() => route('/posts/slug}', () => null)).toThrow(/parameter/i);
  });

  it('should reject consecutive slashes in route paths', () => {
    expect(() => route('/docs//tabs', () => null)).toThrow(
      /consecutive slashes/i
    );
  });

  it('should reject duplicate parameter names in the same route', () => {
    expect(() => route('/users/{id}/posts/{id}', () => null)).toThrow(
      /duplicate parameter/i
    );
  });

  it('should reject named splats unless they are the final segment', () => {
    expect(() => route('/files/{*path}/edit', () => null)).toThrow(
      /splat.*final/i
    );
  });

  it('should reject empty named splats', () => {
    expect(() => route('/files/{*}', () => null)).toThrow(/splat.*name/i);
  });

  it('should reject reserved named splat parameters', () => {
    expect(() => route('/files/{**}', () => null)).toThrow(/splat.*\*/i);
  });

  it('should reject named splats that duplicate another parameter name', () => {
    expect(() => route('/files/{path}/{*path}', () => null)).toThrow(
      /duplicate parameter/i
    );
  });

  it('should accept whitespace-trimmed named splats', () => {
    expect(() => route('/files/{* path }', () => null)).not.toThrow();
  });

  it('should reject absolute child route paths inside a page scope', () => {
    expect(() =>
      page(
        '/docs/components',
        () => null,
        () => {
          route('/tabs', () => null);
        }
      )
    ).toThrow(/child route paths inside page\(\) must be relative/i);
  });

  it('should reject fallback registrations inside a page scope', () => {
    expect(() =>
      page(
        '/docs/components',
        () => null,
        () => {
          group({}, () => {
            fallback(() => null);
          });
        }
      )
    ).toThrow(
      /fallback\(\) inside page\(\) must be declared directly in the page scope/i
    );
  });

  it('should reject nested page registrations inside another page scope', () => {
    expect(() =>
      page(
        '/docs',
        () => null,
        () => {
          page(
            'components',
            () => null,
            () => {
              index(() => null);
            }
          );
        }
      )
    ).toThrow(/page\(\) cannot be nested inside another page\(\)/i);
  });

  it('should reject page registrations inside grouped scopes under a page', () => {
    expect(() =>
      page(
        '/docs',
        () => null,
        () => {
          group({}, () => {
            page(
              'components',
              () => null,
              () => {
                index(() => null);
              }
            );
          });
        }
      )
    ).toThrow(/page\(\) cannot be nested inside another page\(\)/i);
  });

  it('should allow page-local fallback registrations', () => {
    expect(() =>
      page(
        '/docs/components',
        () => null,
        () => {
          fallback(() => null);
        }
      )
    ).not.toThrow();
  });

  it('should reject multiple index routes in the same page scope', () => {
    expect(() =>
      page(
        '/docs/components',
        () => null,
        () => {
          index(() => null);
          index(() => null);
        }
      )
    ).toThrow(/multiple index routes/i);
  });
});

// ---------------------------------------------------------------------------
// Manifest shape
// ---------------------------------------------------------------------------

describe('manifest shape', () => {
  it('should produce a record for each route() call', () => {
    route('/', () => null);
    route('/about', () => null);
    route('/posts/{slug}', () => null);

    const { records } = currentManifest();
    expect(records.map((r) => r.path).sort()).toEqual(
      ['/', '/about', '/posts/{slug}'].sort()
    );
  });

  it('should include pre-parsed segments on each record', () => {
    route('/posts/{slug}', () => null);

    const record = currentManifest().records.find(
      (r) => r.path === '/posts/{slug}'
    )!;
    expect(record.segments).toEqual([
      { kind: 'static', value: 'posts' },
      { kind: 'param', value: 'slug' },
    ]);
  });

  it('should include pre-computed rank on each record', () => {
    route('/posts/{slug}', () => null); // 3 + 2 = 5
    route('/*', () => null); // 0

    const m = currentManifest();
    const slugRecord = m.records.find((r) => r.path === '/posts/{slug}')!;
    const fallback = m.records.find((r) => r.path === '/*')!;

    expect(slugRecord.rank).toBe(5);
    expect(fallback.rank).toBe(-1);
    expect(fallback.isFallback).toBe(true);
  });

  it('should store component reference on the record', () => {
    function BlogPage() {
      return null;
    }
    route('/blog', BlogPage);

    const record = currentManifest().records.find((r) => r.path === '/blog')!;
    expect(record.component).toBe(BlogPage);
  });

  it('should store route options on the record', () => {
    const loader = ({ params }: { params: Record<string, string> }) =>
      Promise.resolve({ id: params.id });
    const policy = () => ({ kind: 'allow' as const });

    route('/items/{id}', () => null, {
      loader,
      policies: [policy],
      title: 'Item detail',
      namespace: 'items-ns',
    });

    const record = currentManifest().records.find(
      (r) => r.path === '/items/{id}'
    )!;
    expect(record.options.loader).toBe(loader);
    expect(record.options.policies).toEqual([policy]);
    expect(record.options.title).toBe('Item detail');
    expect(record.options.namespace).toBe('items-ns');
  });

  it('should store entries generator on the record options', () => {
    const entries = async () => [{ slug: 'hello' }, { slug: 'world' }];
    route('/posts/{slug}', () => null, { entries });

    const record = currentManifest().records.find(
      (r) => r.path === '/posts/{slug}'
    )!;
    expect(record.options.entries).toBe(entries);
  });

  it('should record empty layoutChain when registered outside any layout group', () => {
    route('/bare', () => null);

    const record = currentManifest().records.find((r) => r.path === '/bare')!;
    expect(record.layoutChain).toHaveLength(0);
  });

  it('should record layout chain from an enclosing layout group', () => {
    const L1 = ({ children }: { children?: unknown }) => children;
    const Page = () => null;

    group({ layout: L1 }, () => {
      route('/scoped', Page);
    });

    const record = currentManifest().records.find((r) => r.path === '/scoped')!;
    expect(record.layoutChain).toHaveLength(1);
    expect(record.layoutChain[0].component).toBe(L1);
  });

  it('should record nested layout chains outermost-first', () => {
    const Outer = ({ children }: { children?: unknown }) => children;
    const Inner = ({ children }: { children?: unknown }) => children;
    const Page = () => null;

    group({ layout: Outer }, () => {
      group({ layout: Inner }, () => {
        route('/deep', Page);
      });
    });

    const record = currentManifest().records.find((r) => r.path === '/deep')!;
    expect(record.layoutChain).toHaveLength(2);
    expect(record.layoutChain[0].component).toBe(Outer);
    expect(record.layoutChain[1].component).toBe(Inner);
  });

  it('should record page chains for index and child routes inside a page scope', () => {
    const ComponentsPage = () => null;
    const Overview = () => null;
    const Tabs = () => null;

    page('/docs/components', ComponentsPage, () => {
      index(Overview);
      route('tabs', Tabs);
    });

    const manifest = currentManifest();
    const overviewRecord = manifest.records.find(
      (r) => r.path === '/docs/components'
    )!;
    const tabsRecord = manifest.records.find(
      (r) => r.path === '/docs/components/tabs'
    )!;

    expect(overviewRecord.pageChain).toHaveLength(1);
    expect(overviewRecord.pageChain[0].component).toBe(ComponentsPage);
    expect(tabsRecord.pageChain).toHaveLength(1);
    expect(tabsRecord.pageChain[0].component).toBe(ComponentsPage);
  });

  it('should not include sibling layout scope in another route chain', () => {
    const L1 = ({ children }: { children?: unknown }) => children;
    const L2 = ({ children }: { children?: unknown }) => children;

    group({ layout: L1 }, () => {
      route('/a', () => null);
    });

    group({ layout: L2 }, () => {
      route('/b', () => null);
    });

    const m = currentManifest();
    const a = m.records.find((r) => r.path === '/a')!;
    const b = m.records.find((r) => r.path === '/b')!;

    expect(a.layoutChain[0].component).toBe(L1);
    expect(b.layoutChain[0].component).toBe(L2);
  });
});

// ---------------------------------------------------------------------------
// Auto-composed handler rendering
// ---------------------------------------------------------------------------

describe('auto-composed handler', () => {
  it('should render page component output for bare routes (no layout)', () => {
    route('/page', () => 'page-content');

    const resolved = resolveRoute('/page');
    expect(resolved).not.toBeNull();
    expect(resolved!.handler({})).toBe('page-content');
  });

  it('should wrap page in layout when layout is declared', () => {
    const calls: string[] = [];

    const Layout = ({ children }: { children?: unknown }) => {
      calls.push('layout');
      return { type: 'layout', children };
    };
    const Page = () => {
      calls.push('page');
      return 'page-output';
    };

    group({ layout: Layout }, () => {
      route('/wrapped', Page);
    });

    const resolved = resolveRoute('/wrapped');
    calls.length = 0; // reset
    const output = resolved!.handler({}) as { type: string; children: unknown };

    expect(output.type).toBe('layout');
    expect(output.children).toBe('page-output');
    expect(calls).toEqual(['page', 'layout']);
  });

  it('should pass URL params to the page component', () => {
    let receivedParams: Record<string, string> | null = null;

    route('/items/{id}', (params) => {
      receivedParams = params;
      return null;
    });

    const resolved = resolveRoute('/items/42');
    resolved!.handler(resolved!.params);

    expect(receivedParams).toEqual({ id: '42' });
  });
});

// ---------------------------------------------------------------------------
// _applyManifest — cross-mode parity
// ---------------------------------------------------------------------------

describe('_applyManifest cross-mode parity', () => {
  it('should restore routes from a frozen manifest so resolveRouteFromRoutes works identically', () => {
    route('/', () => 'root');
    route('/posts/{slug}', (p) => `post:${p.slug}`);
    route('/*', () => 'fallback');

    const manifest = currentManifest();

    // Simulate what boot does: clear then apply
    clearRouteState();
    _applyManifest(manifest);

    const root = resolveRoute('/');
    expect(root!.handler({})).toBe('root');

    const post = resolveRoute('/posts/hello');
    expect(post!.handler(post!.params)).toBe('post:hello');

    const fb = resolveRoute('/unknown/path');
    expect(fb!.handler({})).toBe('fallback');
  });

  it('should preserve page-local fallback behavior after manifest replay', () => {
    const ComponentsPage = ({ children }: { children?: unknown }) => ({
      type: 'page',
      children,
    });
    const Overview = () => 'overview';
    const Missing = () => 'missing';
    const RootMissing = () => 'root-missing';

    page('/docs/components', ComponentsPage as never, () => {
      index(Overview);
      fallback(Missing);
    });

    fallback(RootMissing);

    const manifest = currentManifest();
    const freshScopedMiss = resolveRoute('/docs/components/unknown/deeper');
    const freshScopedOutput = freshScopedMiss!.handler(freshScopedMiss!.params);

    clearRouteState();
    _applyManifest(manifest);

    const scopedMiss = resolveRoute('/docs/components/unknown/deeper');
    expect(scopedMiss).not.toBeNull();
    expect(scopedMiss!.handler(scopedMiss!.params)).toEqual(freshScopedOutput);

    const rootMiss = resolveRoute('/outside');
    expect(rootMiss).not.toBeNull();
    expect(rootMiss!.handler(rootMiss!.params)).toBe('root-missing');
  });

  it('should preserve scoped fallback behavior in flat route-list resolution after manifest replay', () => {
    page(
      '/docs/components',
      () => null,
      () => {
        index(() => 'overview');
        fallback(() => 'missing');
      }
    );

    fallback(() => 'root-missing');

    const manifest = currentManifest();
    const freshRoutes = getRouteList();
    const freshScopedMiss = resolveRouteFromRoutes(
      '/docs/components/unknown/deeper',
      freshRoutes
    );
    const freshRootMiss = resolveRouteFromRoutes('/outside', freshRoutes);

    clearRouteState();
    _applyManifest(manifest);

    const replayedRoutes = getRouteList();
    const scopedMiss = resolveRouteFromRoutes(
      '/docs/components/unknown/deeper',
      replayedRoutes
    );
    expect(scopedMiss).not.toBeNull();
    expect(scopedMiss!.handler(scopedMiss!.params)).toEqual(
      freshScopedMiss!.handler(freshScopedMiss!.params)
    );

    const rootMiss = resolveRouteFromRoutes('/outside', replayedRoutes);
    expect(rootMiss).not.toBeNull();
    expect(rootMiss!.handler(rootMiss!.params)).toEqual(
      freshRootMiss!.handler(freshRootMiss!.params)
    );
  });

  it('should return identical params from SSR resolveRouteFromRoutes and SPA resolveRoute', () => {
    route('/users/{id}/posts/{pid}', (p) => `${p.id}:${p.pid}`);

    const manifest = currentManifest();
    const ssrRoutes = manifest.records.map((r) => ({
      path: r.path,
      handler: r.handler,
      namespace: r.options.namespace,
    }));

    const spaResult = resolveRoute('/users/7/posts/99');
    const ssrResult = resolveRouteFromRoutes('/users/7/posts/99', ssrRoutes);

    expect(spaResult!.params).toEqual({ id: '7', pid: '99' });
    expect(ssrResult!.params).toEqual(spaResult!.params);
  });

  it('should preserve declaration order tie-breaks after manifest replay', () => {
    route('/a/{x}', () => 'first');
    route('/a/{y}', () => 'second');

    const manifest = currentManifest();

    clearRouteState();
    _applyManifest(manifest);

    const replayed = resolveRoute('/a/value');
    expect(replayed).not.toBeNull();
    expect(replayed!.handler(replayed!.params)).toBe('first');
  });
});

// ---------------------------------------------------------------------------
// Precedence / registration order
// ---------------------------------------------------------------------------

describe('route precedence', () => {
  it('should resolve named splat routes for deep admin paths', () => {
    route('/admin/buckets/{bucket}/files/{*path}', (params) => {
      return `${params.bucket}:${params.path}`;
    });

    const resolved = resolveRoute('/admin/buckets/main/files/a/b/c');

    expect(resolved).not.toBeNull();
    expect(resolved!.params).toEqual({ bucket: 'main', path: 'a/b/c' });
    expect(resolved!.handler(resolved!.params)).toBe('main:a/b/c');
  });

  it('should resolve named splat routes with an empty trailing path', () => {
    route('/admin/buckets/{bucket}/files/{*path}', (params) => {
      return `${params.bucket}:${params.path}`;
    });

    const resolved = resolveRoute('/admin/buckets/main/files');

    expect(resolved).not.toBeNull();
    expect(resolved!.params).toEqual({ bucket: 'main', path: '' });
    expect(resolved!.handler(resolved!.params)).toBe('main:');
  });

  it('should prefer a more specific static route over a named splat', () => {
    route('/admin/buckets/{bucket}/files/{*path}', () => 'folder');
    route('/admin/buckets/{bucket}/files/blob/{id}', () => 'blob');

    const resolved = resolveRoute('/admin/buckets/main/files/blob/123');

    expect(resolved).not.toBeNull();
    expect(resolved!.params).toEqual({ bucket: 'main', id: '123' });
    expect(resolved!.handler(resolved!.params)).toBe('blob');
  });

  it('should resolve named splats in page-relative routes', () => {
    page(
      '/admin',
      () => null,
      () => {
        route('buckets/{bucket}/files/{*path}', (params) => {
          return `${params.bucket}:${params.path}`;
        });
      }
    );

    const resolved = resolveRoute('/admin/buckets/main/files/a/b');

    expect(resolved).not.toBeNull();
    expect(resolved!.params).toEqual({ bucket: 'main', path: 'a/b' });
  });

  it('should preserve named splats after manifest replay and flat route resolution', () => {
    route('/admin/buckets/{bucket}/files/{*path}', (params) => {
      return `${params.bucket}:${params.path}`;
    });

    const manifest = currentManifest();
    const freshRoutes = getRouteList();
    const freshResolved = resolveRouteFromRoutes(
      '/admin/buckets/main/files/a/b',
      freshRoutes
    );

    clearRouteState();
    _applyManifest(manifest);

    const replayed = resolveRoute('/admin/buckets/main/files/a/b');
    const replayedRoutes = getRouteList();
    const flatResolved = resolveRouteFromRoutes(
      '/admin/buckets/main/files/a/b',
      replayedRoutes
    );

    expect(replayed!.params).toEqual({ bucket: 'main', path: 'a/b' });
    expect(flatResolved!.params).toEqual(freshResolved!.params);
    expect(flatResolved!.handler(flatResolved!.params)).toBe('main:a/b');
  });

  it('should prefer more specific literal over param at same depth', () => {
    route('/posts/featured', () => 'literal');
    route('/posts/{slug}', () => 'param');

    const r = resolveRoute('/posts/featured');
    expect(r!.handler({})).toBe('literal');
  });

  it('should prefer param over wildcard at same depth', () => {
    route('/items/*', () => 'wildcard');
    route('/items/{id}', () => 'param');

    const r = resolveRoute('/items/abc');
    expect(r!.handler({})).toBe('param');
  });

  it('should use declaration order to break rank ties', () => {
    route('/a/{x}', () => 'first');
    route('/a/{y}', () => 'second'); // same rank

    const r = resolveRoute('/a/value');
    expect(r!.handler({})).toBe('first'); // first declared wins
  });

  it('should use catch-all /* as last resort', () => {
    route('/*', () => 'catchall');
    route('/specific', () => 'specific');

    const specific = resolveRoute('/specific');
    expect(specific!.handler({})).toBe('specific');

    const unknown = resolveRoute('/anything/else');
    expect(unknown!.handler({})).toBe('catchall');
  });

  it('should not match duplicate-slash request paths against normalized routes', () => {
    route('/docs/tabs', () => 'tabs');

    const resolved = resolveRoute('/docs//tabs');
    expect(resolved).toBeNull();
  });

  it('should preserve malformed percent-encoded params during route resolution', () => {
    route('/posts/{slug}', () => 'post');

    expect(() => resolveRoute('/posts/%E0%A4%A')).not.toThrow();

    const resolved = resolveRoute('/posts/%E0%A4%A');
    expect(resolved).not.toBeNull();
    expect(resolved!.params).toEqual({ slug: '%E0%A4%A' });
  });
});
