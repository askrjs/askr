import { describe, expect, it } from 'vite-plus/test';
import {
  addRouteBasePath,
  normalizeRouteBasePath,
  removeRouteBasePath,
} from '../../../src/router/base-path';
import { createRouteRegistry, route } from '../../../src/router/route';
import { resolveRouteRequest } from '../../../src/router/resolution';

describe('route registry base paths', () => {
  it.each([
    [undefined, ''],
    ['', ''],
    ['/', ''],
    ['/website', '/website'],
    ['/website/', '/website'],
  ])('should normalize %j to %j', (input, expected) => {
    expect(normalizeRouteBasePath(input)).toBe(expected);
  });

  it.each([
    'website',
    '//website',
    '/web//site',
    '/website?q=1',
    '/website#top',
    '/a/../b',
  ])('should reject invalid base path %j', (basePath) => {
    expect(() => normalizeRouteBasePath(basePath)).toThrow(/basePath/);
  });

  it('should add and remove a base without changing query or hash', () => {
    expect(addRouteBasePath('/reviews/book?q=yes#details', '/website')).toBe(
      '/website/reviews/book?q=yes#details'
    );
    expect(addRouteBasePath('/website/reviews/book', '/website')).toBe(
      '/website/reviews/book'
    );
    expect(
      removeRouteBasePath('/website/reviews/book?q=yes#details', '/website')
    ).toBe('/reviews/book?q=yes#details');
    expect(removeRouteBasePath('/website/', '/website')).toBe('/');
    expect(
      removeRouteBasePath('/another/reviews/book', '/website')
    ).toBeUndefined();
  });

  it('should match physical URLs while exposing logical route context', async () => {
    let pathname = '';
    let href = '';
    const registry = createRouteRegistry(
      () => {
        route('/reviews/{slug}', () => null, {
          loader: (context) => {
            pathname = context.pathname;
            href = context.href;
            return context.params.slug;
          },
        });
      },
      { basePath: '/website/' }
    );

    const resolved = await resolveRouteRequest(
      '/website/reviews/the-zoo-box/?preview=1#summary',
      { registry, mode: 'ssr' }
    );
    expect(resolved?.kind).toBe('render');
    expect(pathname).toBe('/reviews/the-zoo-box/');
    expect(href).toBe('/reviews/the-zoo-box/?preview=1#summary');
    expect(
      await resolveRouteRequest('/reviews/the-zoo-box', {
        registry,
        mode: 'ssr',
      })
    ).toBeNull();
  });

  it('should prefix policy redirects and preserve an empty base', async () => {
    const mounted = createRouteRegistry(
      () => {
        route('/private', () => null, {
          policies: [() => ({ kind: 'redirect', to: '/login' })],
        });
      },
      { basePath: '/website' }
    );
    expect(
      await resolveRouteRequest('/website/private', { registry: mounted })
    ).toMatchObject({ kind: 'redirect', to: '/website/login' });

    const root = createRouteRegistry(() => route('/', () => null), {
      basePath: '',
    });
    expect(root.manifest.basePath).toBeUndefined();
    expect((await resolveRouteRequest('/', { registry: root }))?.kind).toBe(
      'render'
    );
  });
});
