import { describe, expect, it } from 'vite-plus/test';
import { validateRoutes } from '../../../src/ssg/resolve-ssg-data';
import {
  interpolateRoutePath,
  interpolateRouteUrl,
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
