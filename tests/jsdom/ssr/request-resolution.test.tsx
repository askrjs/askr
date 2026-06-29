import { describe, it, expect, beforeEach, vi } from 'vite-plus/test';
import {
  getManifest,
  clearRoutes,
  registerRoutes,
  getRoutes,
  createRouteRegistry,
  fallback,
  page,
  route,
} from '../../../src/router/route';
import { renderToString, resolveRequest } from '../../../src/ssr';
import { renderResolvedToStringSync } from '../../../src/ssr/render-resolved';
import { getCurrentRenderData } from '../../../src/ssr/render-keys';

describe('SSR request resolution', () => {
  beforeEach(() => {
    clearRoutes();
  });

  it('should redirect protected requests before render', async () => {
    registerRoutes(
      () => {
        route('/login', () => <div>{'login'}</div>, { auth: 'guest' });
        route('/dashboard', () => <div>{'dashboard'}</div>, { auth: true });
      },
      {
        auth: {
          resolve: () => ({ session: null, user: null }),
          loginPath: '/login',
        },
      }
    );

    const result = await resolveRequest({
      url: '/dashboard?tab=usage',
      manifest: getManifest(),
    });

    expect(result).toEqual({
      kind: 'redirect',
      to: '/login?next=%2Fdashboard%3Ftab%3Dusage',
      replace: false,
    });
  });

  it('should deny role-gated requests before render', async () => {
    registerRoutes(
      () => {
        route('/admin', () => <div>{'admin'}</div>, { role: 'admin' });
      },
      {
        auth: {
          resolve: () => ({
            session: { id: 'session_1' },
            user: { roles: ['member'] },
          }),
        },
      }
    );

    const result = await resolveRequest({
      url: '/admin',
      manifest: getManifest(),
    });

    expect(result).toEqual({
      kind: 'deny',
      status: 403,
    });
  });

  it('should render plain route tables when no manifest is provided', async () => {
    const handler = () => <div>{'home'}</div>;

    const result = await resolveRequest({
      url: '/',
      routes: [{ path: '/', handler }],
    });

    expect(result).toEqual({
      kind: 'render',
      handler,
      params: {},
    });
  });

  it('should resolve requests from an explicit route registry', async () => {
    const registry = createRouteRegistry(() => {
      route('/registry/{id}', ({ id }) => <div>{id}</div>);
    });

    const result = await resolveRequest({
      url: '/registry/42',
      registry,
    });

    expect(result).toEqual({
      kind: 'render',
      handler: expect.any(Function),
      params: { id: '42' },
    });
  });

  it('should not match duplicate-slash request URLs against normalized routes', async () => {
    registerRoutes(() => {
      route('/docs/tabs', () => <div>{'tabs'}</div>);
    });

    const result = await resolveRequest({
      url: '/docs//tabs',
      manifest: getManifest(),
    });

    expect(result).toBeNull();
  });

  it('should preserve malformed percent-encoded params during SSR request resolution', async () => {
    registerRoutes(() => {
      route('/posts/{slug}', () => <div>{'post'}</div>);
    });

    const result = await resolveRequest({
      url: '/posts/%E0%A4%A',
      manifest: getManifest(),
    });

    expect(result).toEqual({
      kind: 'render',
      handler: expect.any(Function),
      params: { slug: '%E0%A4%A' },
    });
  });

  it('should run route loaders for SSR manifest requests and expose their data during render', async () => {
    const loader = vi.fn(({ params }: { params: Record<string, string> }) => ({
      slug: params.slug,
    }));

    registerRoutes(() => {
      route(
        '/posts/{slug}',
        () => {
          const data = getCurrentRenderData();
          return <div>{String(data?.slug ?? 'missing')}</div>;
        },
        {
          loader,
        }
      );
    });

    const result = await resolveRequest({
      url: '/posts/intro',
      manifest: getManifest(),
    });

    expect(result).toEqual({
      kind: 'render',
      handler: expect.any(Function),
      params: { slug: 'intro' },
    });

    if (!result || result.kind !== 'render') {
      throw new Error(
        'expected SSR route resolution to return a render result'
      );
    }

    const html = renderResolvedToStringSync({
      url: '/posts/intro',
      routes: getRoutes(),
      handler: result.handler,
      params: result.params,
    });

    expect(loader).toHaveBeenCalledTimes(1);
    expect(loader).toHaveBeenCalledWith({ params: { slug: 'intro' } });
    expect(html).toContain('intro');
  });

  it('should preserve scoped fallback params when rendering getRoutes()', () => {
    let receivedCatchAll: string | undefined;

    page(
      '/docs',
      () => <section>{'docs'}</section>,
      () => {
        fallback((params) => {
          receivedCatchAll = params['*'];
          return <div>{'missing'}</div>;
        });
      }
    );

    renderToString({
      url: '/docs/a/b',
      routes: getRoutes(),
    });

    expect(receivedCatchAll).toBe('/a/b');
  });

  it('should preserve scoped fallback params when rendering a registry', () => {
    let receivedCatchAll: string | undefined;

    const registry = createRouteRegistry(() => {
      page(
        '/docs',
        () => <section>{'docs'}</section>,
        () => {
          fallback((params) => {
            receivedCatchAll = params['*'];
            return <div>{'missing'}</div>;
          });
        }
      );
    });

    renderToString({
      url: '/docs/a/b',
      registry,
    });

    expect(receivedCatchAll).toBe('/a/b');
  });
});
