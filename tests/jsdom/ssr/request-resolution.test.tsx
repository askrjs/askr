import { resetRouteState } from '../../router-test-utils';
import { describe, it, expect, beforeEach, vi } from 'vite-plus/test';
import { requireAnonymous, requireRole, requireUser } from '@askrjs/auth';
import {
  createRouteRegistry,
  fallback,
  lazy,
  page,
  resolveRouteRequest,
  route,
} from '../../../src/router/route';
import { deny } from '../../../src/router/policy';
import {
  renderRouteRequestToString,
  renderToStream,
  renderToString,
  resolveRequest,
  SSRAccessDecisionError,
  SSRDataMissingError,
} from '../../../src/ssr';
import { renderResolvedToStringSync } from '../../../src/ssr/render-resolved';
import { getCurrentRenderData } from '../../../src/ssr/render-keys';

function captureError(fn: () => unknown): unknown {
  try {
    fn();
  } catch (error) {
    return error;
  }
  throw new Error('expected the call to throw');
}

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

  it('should preserve auth decisions given denied principals when the same route is rendered through SPA and SSR', async () => {
    const member = {
      authenticated: true,
      principal: { id: 'user-1', roles: ['member'] },
      session: null,
      tenant: null,
    };
    const registry = createRouteRegistry(() => {
      route('/admin', () => <div>admin</div>, {
        auth: requireRole('admin'),
      });
    });

    const [spa, ssr] = await Promise.all([
      resolveRouteRequest('/admin', {
        registry,
        mode: 'spa',
        authContext: member,
      }),
      resolveRouteRequest('/admin', {
        registry,
        mode: 'ssr',
        authContext: member,
      }),
    ]);

    expect(spa).toEqual({ kind: 'deny', status: 403 });
    expect(ssr).toEqual(spa);
  });

  it('should return denied sync SSR requests to the caller without rendering', () => {
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

    const error = captureError(() =>
      renderToString({
        url: '/private',
        registry,
      })
    ) as { code?: string; decision?: unknown };

    expect(renderedProtectedContent).toBe(false);
    expect(error).toBeInstanceOf(SSRAccessDecisionError);
    expect(error.code).toBe('SSR_ACCESS_DECISION');
    expect(error.decision).toEqual({ kind: 'deny', status: 403 });
  });

  it('should return redirected sync SSR requests to the caller without rendering the target', () => {
    let renderedDashboard = false;
    let renderedLogin = false;
    const chunks: string[] = [];

    const registry = createRouteRegistry(
      () => {
        route(
          '/login',
          () => {
            renderedLogin = true;
            return <div>{'login-page'}</div>;
          },
          { auth: requireAnonymous() }
        );
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

    const error = captureError(() =>
      renderToString({
        url: '/dashboard?tab=usage',
        registry,
      })
    ) as { code?: string; decision?: unknown };
    const streamError = captureError(() =>
      renderToStream({
        url: '/dashboard?tab=usage',
        registry,
        onChunk: (chunk) => chunks.push(chunk),
        onComplete: () => undefined,
      })
    ) as { decision?: unknown };

    expect(renderedDashboard).toBe(false);
    expect(renderedLogin).toBe(false);
    expect(chunks).toEqual([]);
    expect(error).toBeInstanceOf(SSRAccessDecisionError);
    expect(error.code).toBe('SSR_ACCESS_DECISION');
    expect(error.decision).toEqual({
      kind: 'redirect',
      to: '/login?next=%2Fdashboard%3Ftab%3Dusage',
      replace: false,
    });
    expect(streamError.decision).toEqual(error.decision);
  });

  // @askr-allow-real-timers -- Node reports unhandled rejections only after a
  // macrotask checkpoint.
  it('should reject sync SSR of loader routes without starting the loader', async () => {
    const unhandled = vi.fn();
    process.on('unhandledRejection', unhandled);
    const loader = vi.fn(async () => {
      throw new Error('loader failed');
    });
    const registry = createRouteRegistry(() => {
      route('/posts/{slug}', () => <div>{'post'}</div>, { loader });
    });

    try {
      const error = captureError(() =>
        renderToString({ url: '/posts/intro', registry })
      ) as Error;
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(loader).not.toHaveBeenCalled();
      expect(unhandled).not.toHaveBeenCalled();
      expect(error).toBeInstanceOf(SSRDataMissingError);
      expect(error.message).toContain('/posts/{slug}');
      expect(error.message).toContain('loader');
      expect(error.message).toContain('renderRouteRequest');
    } finally {
      process.off('unhandledRejection', unhandled);
    }
  });

  it('should reject loader routes before starting their preload or lazy import', () => {
    const loader = vi.fn(() => ({ ready: true }));
    const preload = vi.fn(() => undefined);
    const factory = vi.fn(async () => ({
      default: () => <div>{'lazy-post'}</div>,
    }));
    const registry = createRouteRegistry(() => {
      route('/preloaded', () => <div>{'preloaded'}</div>, {
        loader,
        preload,
      });
      route('/lazy', lazy(factory), { loader });
    });

    for (const url of ['/preloaded', '/lazy']) {
      const error = captureError(() =>
        renderToString({ url, registry })
      ) as Error;

      expect(error).toBeInstanceOf(SSRDataMissingError);
      expect(error.message).toContain(`route ${url} declares a loader`);
      expect(error.message).toContain('renderRouteRequest');
    }
    expect(loader).not.toHaveBeenCalled();
    expect(preload).not.toHaveBeenCalled();
    expect(factory).not.toHaveBeenCalled();
  });

  it('should render lazy routes synchronously once their component is loaded', async () => {
    const registry = createRouteRegistry(() => {
      route(
        '/lazy',
        lazy(async () => ({ default: () => <div>{'lazy-page'}</div> }))
      );
    });

    const rendered = await renderRouteRequestToString({
      url: '/lazy',
      registry,
    });

    expect(rendered.kind).toBe('render');
    expect(renderToString({ url: '/lazy', registry })).toContain(
      '<div>lazy-page</div>'
    );
  });

  // @askr-allow-real-timers -- Node reports unhandled rejections only after a
  // macrotask checkpoint.
  it('should reject async sync-SSR route resolution without leaking an unhandled rejection', async () => {
    const unhandled = vi.fn();
    process.on('unhandledRejection', unhandled);
    const registry = createRouteRegistry(() => {
      route('/private', () => <div>{'private'}</div>, {
        policies: [() => Promise.reject(new Error('policy failed'))],
      });
    });

    try {
      const error = captureError(() =>
        renderToString({ url: '/private', registry })
      ) as Error;
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(unhandled).not.toHaveBeenCalled();
      expect(error).toBeInstanceOf(SSRDataMissingError);
      expect(error.message).toContain('renderRouteRequest');
    } finally {
      process.off('unhandledRejection', unhandled);
    }
  });

  it('should reject plain route tables without a registry', async () => {
    const handler = () => <div>{'home'}</div>;

    await expect(
      resolveRequest({
        url: '/',
        routes: [{ path: '/', handler }],
      } as never)
    ).rejects.toThrow();
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

  describe('renderResolvedToStringSync', () => {
    it('should render a param-less route when params are omitted', () => {
      const Page = () => <main>{'public'}</main>;
      const registry = createRouteRegistry(() => {
        route('/public', Page);
      });

      const html = renderResolvedToStringSync({
        url: '/public',
        registry,
        handler: Page,
      });

      expect(html).toContain('<main>public</main>');
    });

    it('should render a parameterized route with matching params', () => {
      const Post = (params: { slug?: string }) => <main>{params.slug}</main>;
      const registry = createRouteRegistry(() => {
        route('/public', () => <main>{'public'}</main>);
        route('/posts/{slug}', Post);
      });

      const html = renderResolvedToStringSync({
        url: '/posts/intro',
        registry,
        handler: Post,
        params: { slug: 'intro' },
      });

      expect(html).toContain('<main>intro</main>');
    });

    it('should reject params that do not match the url', () => {
      const Post = (params: { slug?: string }) => <main>{params.slug}</main>;
      const registry = createRouteRegistry(() => {
        route('/posts/{slug}', Post);
      });

      expect(() =>
        renderResolvedToStringSync({
          url: '/posts/intro',
          registry,
          handler: Post,
          params: { slug: 'other' },
        })
      ).toThrow(/no route found for url: \/posts\/intro/);
    });
  });
});
