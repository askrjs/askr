import { describe, expect, it } from 'vite-plus/test';
import { validateRoutes } from '../../../src/ssg/resolve-ssg-data';
import {
  interpolateRoutePath,
  interpolateRouteUrl,
  validateOutputPathCollisions,
} from '../../../src/ssg/route-utils';

describe('SSG route parameter map compatibility', () => {
  it('should retain inherited string getter parameters', () => {
    class ParameterMap {
      [name: string]: string;

      get slug(): string {
        return 'inherited#value';
      }
    }
    const params = new ParameterMap();

    expect(() =>
      validateRoutes([{ path: '/posts/{slug}', handler: () => null, params }])
    ).not.toThrow();
    expect(interpolateRoutePath('/posts/{slug}', params)).toBe(
      '/posts/inherited#value'
    );
    expect(interpolateRouteUrl('/posts/{slug}', params)).toBe(
      '/posts/inherited%23value'
    );
  });

  it.each(['toString', '__proto__'])(
    'should reject an inherited builtin value for parameter %s',
    (name) => {
      expect(() =>
        validateRoutes([
          { path: `/posts/{${name}}`, handler: () => null, params: {} },
        ])
      ).toThrow(`missing required param "${name}"`);
    }
  );

  it('should accept an own prototype-named string parameter', () => {
    const params = JSON.parse('{"__proto__":"own"}') as Record<string, string>;

    expect(() =>
      validateRoutes([
        { path: '/posts/{__proto__}', handler: () => null, params },
      ])
    ).not.toThrow();
  });
});

describe('SSG portable output path collisions', () => {
  const descriptor = (path: string) => ({
    route: { path, handler: () => null },
    path,
    filePath: `${path.slice(1)}/index.html`,
    routeId: `${path}::${path.slice(1)}/index.html`,
    invalidationKeys: [],
  });

  it.each([
    ['/Straße', '/STRASSE'],
    ['/Ꭰ', '/ꭰ'],
    ['/Ᏸ', '/ᏸ'],
    ['/Σ', '/ς'],
    ['/ſ', '/s'],
    ['/ﬀ', '/ff'],
    ['/µ', '/μ'],
    ['/ẞ', '/ss'],
  ])('should reject case-fold-equivalent paths %s and %s', (left, right) => {
    expect(() =>
      validateOutputPathCollisions([descriptor(left), descriptor(right)])
    ).toThrow(/output path collision/i);
  });

  it('should keep Unicode case-fold-distinct dotless i paths separate', () => {
    expect(() =>
      validateOutputPathCollisions([descriptor('/ı'), descriptor('/i')])
    ).not.toThrow();
  });

  it.each([
    '/metadata.json',
    '/metadata.json/report',
    '/.askr/ssg-manifest.json',
  ])('should reject a route that overlaps generated file %s', (path) => {
    expect(() => validateOutputPathCollisions([descriptor(path)])).toThrow(
      /output path collision.*generated file/i
    );
  });

  it('should reject route outputs where one file path is another route directory', () => {
    expect(() =>
      validateOutputPathCollisions([
        descriptor('/posts'),
        descriptor('/posts/index.html'),
      ])
    ).toThrow(/output path collision/i);
  });
});
