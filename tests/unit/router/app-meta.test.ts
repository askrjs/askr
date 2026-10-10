import { describe, expect, it } from 'vite-plus/test';
import {
  createRouteRegistry,
  fallback,
  group,
  matchRoute,
  page,
  route,
} from '@askrjs/askr/router';
import {
  computeMatchesFromRoutes,
  computeMatchesFromRouteRecords,
} from '../../../src/router/route-matching';

describe('application route metadata', () => {
  it('should capture group/page/group/leaf declarations in order without path deduplication', () => {
    const outer = { breadcrumb: 'Application', requiredGrants: ['app:read'] };
    const inner = { requiredGrants: ['report:read'] };
    const registry = createRouteRegistry(() => {
      group({ appMeta: outer }, () => {
        group({ appMeta: { breadcrumb: 'Reports' } }, () => {
          page(
            '/reports/{id}',
            () => null,
            { appMeta: { breadcrumb: 'Report' } },
            () => {
              group({ appMeta: inner }, () => {
                route('export', () => null, {
                  appMeta: { requiredGrants: ['report:export'] },
                  namespace: 'reports',
                });
              });
            }
          );
        });
      });
    });
    outer.breadcrumb = 'Changed';
    outer.requiredGrants.push('unexpected');
    inner.requiredGrants.length = 0;

    const matches = computeMatchesFromRoutes(
      '/reports/42/export',
      registry.routes
    );
    expect(matches.map((entry) => [entry.path, entry.appMeta])).toEqual([
      ['/', { breadcrumb: 'Application', requiredGrants: ['app:read'] }],
      ['/', { breadcrumb: 'Reports' }],
      ['/reports/{id}', { breadcrumb: 'Report' }],
      ['/reports/{id}', { requiredGrants: ['report:read'] }],
      ['/reports/{id}/export', { requiredGrants: ['report:export'] }],
    ]);
    expect(
      computeMatchesFromRouteRecords(
        '/reports/42/export',
        registry.manifest.records
      )
    ).toEqual(matches);
    expect(
      matches.every(
        (entry) =>
          Object.isFrozen(entry) &&
          Object.isFrozen(entry.params) &&
          Object.isFrozen(entry.appMeta)
      )
    ).toBe(true);
    expect(
      Object.isFrozen((matches[0].appMeta as typeof outer).requiredGrants)
    ).toBe(true);
    expect(Object.isFrozen(outer)).toBe(false);
    expect(matches.every((entry) => entry.params.id === '42')).toBe(true);
    expect(matchRoute('/reports/42/export', { registry })).toEqual({
      path: '/reports/{id}/export',
      params: { id: '42' },
      namespace: 'reports',
      appMeta: { requiredGrants: ['report:export'] },
    });
  });

  it('should keep identical paths in independent registries and preserves absent leaf metadata', () => {
    const build = (name: string) =>
      createRouteRegistry(
        () => {
          page(
            '/items',
            () => null,
            { appMeta: { name } },
            () => {
              route('{id}', () => null);
              fallback(() => null);
            }
          );
        },
        { basePath: '/app' }
      );
    const first = build('first');
    const second = build('second');
    for (const [registry, name] of [
      [first, 'first'],
      [second, 'second'],
    ] as const) {
      const matches = computeMatchesFromRoutes('/items/2', registry.routes);
      expect(matches.map((entry) => entry.appMeta)).toEqual([
        { name },
        undefined,
      ]);
      expect(matchRoute('/app/items/2', { registry })?.path).toBe(
        '/items/{id}'
      );
      expect(matchRoute('/items/2', { registry })).toBeNull();
      expect(
        computeMatchesFromRoutes('/items/missing/path', registry.routes).map(
          (entry) => entry.path
        )
      ).toEqual(['/items', '/items/*']);
    }
    const plain = createRouteRegistry(() => route('/items/{id}', () => null));
    expect(computeMatchesFromRoutes('/items/2', plain.routes)).toHaveLength(1);
  });

  it.each([false, 0, '', null])(
    'should retain falsy metadata %s',
    (appMeta) => {
      const registry = createRouteRegistry(() =>
        route('/', () => null, { appMeta })
      );
      expect(matchRoute('/', { registry })?.appMeta).toBe(appMeta);
      expect(registry.manifest.records[0].options.appMeta).toBe(appMeta);
    }
  );

  it('should keep the captured leaf independent of exposed manifest option reassignment', () => {
    const registry = createRouteRegistry(() =>
      route('/', () => null, {
        appMeta: { label: 'Captured' },
      })
    );
    Reflect.set(registry.manifest.records[0].options, 'appMeta', {
      label: 'Reassigned',
    });
    expect(
      matchRoute<{ label: string }>('/', { registry })?.appMeta?.label
    ).toBe('Captured');
    expect(computeMatchesFromRoutes('/', registry.routes)[0].appMeta).toEqual({
      label: 'Captured',
    });
  });

  it('should copy cyclic ordinary data without freezing caller values or reading accessors', () => {
    const data: { self?: unknown; nested: { label: string } } = {
      nested: { label: 'original' },
    };
    data.self = data;
    const registry = createRouteRegistry(() =>
      route('/', () => null, { appMeta: data })
    );
    const copy = matchRoute<typeof data>('/', { registry })!.appMeta!;
    expect(copy).not.toBe(data);
    expect(copy.self).toBe(copy);
    expect(Object.isFrozen(copy)).toBe(true);
    data.nested.label = 'changed';
    expect(copy.nested.label).toBe('original');
    let reads = 0;
    expect(() =>
      createRouteRegistry(() =>
        group(
          {
            appMeta: {
              get value() {
                reads++;
                return 1;
              },
            },
          },
          () => route('/', () => null)
        )
      )
    ).toThrow(/appMeta.*ordinary.*data/i);
    expect(reads).toBe(0);
    expect(() =>
      createRouteRegistry(() => route('/', () => null, { appMeta: new Map() }))
    ).toThrow(/appMeta.*ordinary.*data/i);
    expect(() =>
      createRouteRegistry(() =>
        page(
          '/',
          () => null,
          { appMeta: () => null },
          () => route('', () => null)
        )
      )
    ).toThrow(/appMeta.*ordinary.*data/i);
  });
});
