import { describe, expect, it } from 'vite-plus/test';
import { requireUser } from '@askrjs/auth';
import { Link } from '../../../src/components/link';
import { to } from '../../../src/router/destination';
import { redirect } from '../../../src/router/policy';
import { createRouteRegistry, route } from '../../../src/router/route';
import type { RouteRef } from '../../../src/common/router';
import { renderRouteRequestToString } from '../../../src/ssr';

const PATH_LIKE_CROSS_ORIGIN = [
  '/\\evil.example/x',
  '//evil.example/x',
  '/\t/evil.example/x',
  '\\\\evil.example/x',
  ' //evil.example/x',
  '/.//evil.example/x',
  '/%2e//evil.example',
  '/x/..//evil.example/x',
];

describe('server redirect targets', () => {
  it.each(PATH_LIKE_CROSS_ORIGIN)(
    'should refuse a policy redirect to path-like cross-origin target %j',
    async (target) => {
      const registry = createRouteRegistry(() => {
        route('/private', () => <main>private</main>, {
          policies: [() => redirect(target)],
        });
      });

      await expect(
        renderRouteRequestToString({ url: '/private', registry })
      ).rejects.toThrow(TypeError);
    }
  );

  it.each(PATH_LIKE_CROSS_ORIGIN)(
    'should refuse a hand-built redirect decision to %j',
    async (target) => {
      const registry = createRouteRegistry(() => {
        route('/private', () => <main>private</main>, {
          policies: [() => ({ kind: 'redirect', to: target })],
        });
      });

      await expect(
        renderRouteRequestToString({ url: '/private', registry })
      ).rejects.toThrow(TypeError);
    }
  );

  it('should refuse a path-like cross-origin loginPath', async () => {
    const registry = createRouteRegistry(
      () => {
        route('/private', () => <main>private</main>, { auth: requireUser() });
      },
      { auth: { loginPath: '/\\evil.example/login' } }
    );

    await expect(
      renderRouteRequestToString({ url: '/private', registry })
    ).rejects.toThrow(TypeError);
  });

  it('should keep the origin of an explicit cross-origin loginPath', async () => {
    const registry = createRouteRegistry(
      () => {
        route('/private', () => <main>private</main>, { auth: requireUser() });
      },
      { auth: { loginPath: 'https://auth.example/login?app=1' } }
    );

    const result = await renderRouteRequestToString({
      url: '/private?tab=2',
      registry,
    });

    expect(result).toMatchObject({
      kind: 'redirect',
      to: 'https://auth.example/login?app=1&next=%2Fprivate%3Ftab%3D2',
    });
  });

  it('should allow an explicit https redirect to another origin', async () => {
    const registry = createRouteRegistry(() => {
      route('/private', () => <main>private</main>, {
        policies: [() => redirect('https://sso.example/login')],
      });
    });

    await expect(
      renderRouteRequestToString({ url: '/private', registry })
    ).resolves.toMatchObject({
      kind: 'redirect',
      to: 'https://sso.example/login',
    });
  });

  it('should not prefix a spread typed-destination redirect twice below a basePath', async () => {
    let settings!: RouteRef;
    const registry = createRouteRegistry(
      () => {
        settings = route('/settings', () => <main>settings</main>);
        route('/old', () => null, {
          policies: [
            () => ({ ...redirect(to(settings, {})), status: 303 as const }),
          ],
        });
        route('/older', () => null, {
          policies: [
            () => ({ ...redirect(to(settings, {})), to: '/settings' }),
          ],
        });
      },
      { basePath: '/app' }
    );

    await expect(
      renderRouteRequestToString({ url: '/app/old', registry })
    ).resolves.toMatchObject({
      kind: 'redirect',
      to: '/app/settings',
      status: 303,
    });
    // Replacing `to` with a string makes it logical again.
    await expect(
      renderRouteRequestToString({ url: '/app/older', registry })
    ).resolves.toMatchObject({ kind: 'redirect', to: '/app/settings' });
  });
});

describe('Link path-like cross-origin hrefs', () => {
  it.each(PATH_LIKE_CROSS_ORIGIN)('should reject Link href %j', (href) => {
    expect(() => Link({ href, children: 'evil' })).toThrow(TypeError);
  });

  it('should keep explicit cross-origin and relative Link hrefs', () => {
    expect(() =>
      Link({ href: 'https://other.example/x', children: 'ok' })
    ).not.toThrow();
    expect(() => Link({ href: 'sibling', children: 'ok' })).not.toThrow();
    expect(() => Link({ href: '#top', children: 'ok' })).not.toThrow();
  });
});
