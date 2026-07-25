import {
  resetRouteState,
  currentRouteManifest,
  currentRouteList,
  currentRouteRegistry,
  routeRegistryFromTable,
} from '../../router-test-utils';
import { describe, it, expect, beforeEach, vi } from 'vite-plus/test';
import { requireAnonymous, requireRole, requireUser } from '@askrjs/auth';
import {
  createRouteRegistry,
  fallback,
  page,
  route,
} from '../../../src/router/route';
import { deny } from '../../../src/router/policy';
import { renderToString, resolveRequest } from '../../../src/ssr';
import { renderResolvedToStringSync } from '../../../src/ssr/render-resolved';
import { getCurrentRenderData } from '../../../src/ssr/render-keys';

describe('SSR request resolution', () => {
  beforeEach(() => {
    resetRouteState();
  });

  it('should redirect protected requests before render', async () => {
    const registry = createRouteRegistry(
      () => {
        route('/login', () => <div>{'login'}</div>, {
          auth: requireAnonymous(),
        });
        route('/dashboard', () => <div>{'dashboard'}</div>, {
          auth: requireUser(),
        });
      },
      {
        auth: {
          resolve: () => ({
            authenticated: false,
            principal: null,
            session: null,
            tenant: null,
          }),
          loginPath: '/login',
        },
      }
    );

    const result = await resolveRequest({
      url: '/dashboard?tab=usage',
      registry,
    });

    expect(result).toEqual({
      kind: 'redirect',
      to: '/login?next=%2Fdashboard%3Ftab%3Dusage',
      replace: false,
    });
  });

  it('should deny role-gated requests before render', async () => {
    const registry = createRouteRegistry(
      () => {
        route('/admin', () => <div>{'admin'}</div>, {
          auth: requireRole('admin'),
        });
      },
      {
        auth: {
          resolve: () => ({
            authenticated: true,
            principal: { id: 'user-1', roles: ['member'] },
            session: null,
            tenant: null,
          }),
        },
      }
    );

    const result = await resolveRequest({
      url: '/admin',
      registry,
    });

    expect(result).toEqual({
      kind: 'deny',
      status: 403,
    });
  });

  it('should render denied SSR requests without invoking protected content', () => {
    let renderedProtectedContent = false;

    const registry = createRouteRegistry(() => {
      route(
        '/private',
        () => {
          renderedProtectedContent = true;
          return <div>{'private'}</div>;
        },
        { policies: [() => deny(403)] }
      );
    });

    const html = renderToString({
      url: '/private',
      registry,
    });

    expect(renderedProtectedContent).toBe(false);
    expect(html).toBe('<div data-route-denied="403">403</div>');
  });

  it('should render redirected SSR requests at the redirect target', () => {
    let renderedDashboard = false;

    const registry = createRouteRegistry(
      () => {
        route('/login', () => <div>{'login-page'}</div>, {
          auth: requireAnonymous(),
        });
        route(
          '/dashboard',
          () => {
            renderedDashboard = true;
            return <div>{'dashboard-page'}</div>;
          },
          { auth: requireUser() }
        );
      },
      {
        auth: {
          resolve: () => ({
            authenticated: false,
            principal: null,
            session: null,
            tenant: null,
          }),
          loginPath: '/login',
        },
      }
    );

    const html = renderToString({
      url: '/dashboard?tab=usage',
      registry,
    });

    expect(renderedDashboard).toBe(false);
    expect(html).toBe('<div>login-page</div>');
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
    const registry = createRouteRegistry(() => {
      route('/docs/tabs', () => <div>{'tabs'}</div>);
    });

    const result = await resolveRequest({
      url: '/docs//tabs',
      registry,
    });

    expect(result).toBeNull();
  });

  it('should preserve malformed percent-encoded params during SSR request resolution', async () => {
    const registry = createRouteRegistry(() => {
      route('/posts/{slug}', () => <div>{'post'}</div>);
    });

    const result = await resolveRequest({
      url: '/posts/%E0%A4%A',
      registry,
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

    const registry = createRouteRegistry(() => {
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
      registry,
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
      routes: registry.routes,
      registry,
      handler: result.handler,
      params: result.params,
    });

    expect(loader).toHaveBeenCalledTimes(1);
    expect(loader).toHaveBeenCalledWith(
      expect.objectContaining({
        params: { slug: 'intro' },
        auth: expect.objectContaining({ authenticated: false }),
        mode: 'ssr',
      })
    );
    expect(html).toContain('intro');
  });

  it('should preserve scoped fallback params when rendering currentRouteList()', () => {
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
