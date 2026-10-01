import { describe, expect, it } from 'vite-plus/test';
import { validateRoutes } from '../../../src/ssg/resolve-ssg-data';
import {
  interpolateRoutePath,
  interpolateRouteUrl,
} from '../../../src/ssg/route-utils';

describe('SSG route parameter spelling compatibility', () => {
  it.each([
    {
      template: '/docs/{*path}',
      key: '*path',
      value: 'guide/a#b',
      path: '/docs/guide/a#b',
      url: '/docs/guide/a%23b',
    },
    {
      template: '/posts/{ slug }',
      key: ' slug ',
      value: 'a#b',
      path: '/posts/a#b',
      url: '/posts/a%23b',
    },
    {
      template: '/docs/{ *path }',
      key: ' *path ',
      value: 'guide/start',
      path: '/docs/guide/start',
      url: '/docs/guide/start',
    },
    {
      template: '/docs/{*__proto__}',
      key: '*__proto__',
      value: 'guide/start',
      path: '/docs/guide/start',
      url: '/docs/guide/start',
    },
    {
      template: '/docs/{*constructor}',
      key: '*constructor',
      value: 'guide/start',
      path: '/docs/guide/start',
      url: '/docs/guide/start',
    },
    {
      template: '/docs/{*toString}',
      key: '*toString',
      value: 'guide/start',
      path: '/docs/guide/start',
      url: '/docs/guide/start',
    },
  ])(
    'should preserve raw token key $key for widened template $template',
    ({ template, key, value, path, url }) => {
      const params: Record<string, string> = { [key]: value };

      expect(() =>
        validateRoutes([{ path: template, handler: () => null, params }])
      ).not.toThrow();
      expect(interpolateRoutePath(template, params)).toBe(path);
      expect(interpolateRouteUrl(template, params)).toBe(url);
    }
  );

  it.each(['preferred#entry', ''])(
    'should prefer canonical path %j over its legacy spelling',
    (path) => {
      const params = { path, '*path': 'legacy/value' };

      expect(() =>
        validateRoutes([{ path: '/docs/{*path}', handler: () => null, params }])
      ).not.toThrow();
      expect(interpolateRoutePath('/docs/{*path}', params)).toBe(
        `/docs/${path}`
      );
      expect(interpolateRouteUrl('/docs/{*path}', params)).toBe(
        `/docs/${path.replace('#', '%23')}`
      );
    }
  );

  it('should reject an explicitly provided invalid canonical key rather than using the legacy alias', () => {
    const params = {
      path: undefined,
      '*path': 'legacy/value',
    } as unknown as Record<string, string>;

    expect(() =>
      validateRoutes([{ path: '/docs/{*path}', handler: () => null, params }])
    ).toThrow('params must be an object containing only string values');
    expect(interpolateRoutePath('/docs/{*path}', params)).toBe('/docs/');
    expect(interpolateRouteUrl('/docs/{*path}', params)).toBe('/docs/');
  });

  it('should retain inherited canonical string getters ahead of raw aliases without rereading during validation', () => {
    let reads = 0;
    class ParameterMap {
      [name: string]: string;
      '*path' = 'legacy/value';
      get path(): string {
        reads++;
        return 'canonical/value';
      }
    }
    const params = new ParameterMap();

    expect(() =>
      validateRoutes([{ path: '/docs/{*path}', handler: () => null, params }])
    ).not.toThrow();
    expect(reads).toBe(1);
    expect(interpolateRoutePath('/docs/{*path}', params)).toBe(
      '/docs/canonical/value'
    );
  });
});
