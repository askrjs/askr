import {
  resetRouteState,
  currentRouteManifest,
  currentRouteList,
  currentRouteRegistry,
  routeRegistryFromTable,
} from '../../router-test-utils';
import { describe, it, expect, beforeEach, afterEach } from 'vite-plus/test';
import { requireAnonymous, requireUser } from '@askrjs/auth';
import { createSPA } from '@askrjs/askr/boot';
import { navigate } from '../../../src/router/navigate';
import { allow } from '../../../src/router/policy';
import {
  fallback,
  group,
  index,
  Outlet,
  page,
  createRouteRegistry,
  resolveRouteRequest,
  route,
} from '../../../src/router/route';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';

describe('callback route registration', () => {
  let container: HTMLElement;
  let cleanup: () => void;

  beforeEach(() => {
    const result = createTestContainer();
    container = result.container;
    cleanup = result.cleanup;
    resetRouteState();
    window.history.replaceState({}, '', '/');
  });

  afterEach(() => {
    cleanup();
  });

  it('should register callback routes with inherited layouts and a root fallback', () => {
    const Root = ({ children }: { children?: unknown }) => (
      <div data-layout="root">{children}</div>
    );
    const Workspace = ({ children }: { children?: unknown }) => (
      <section data-layout="workspace">{children}</section>
    );

    const registry = createRouteRegistry(
      () => {
        group({ layout: Root }, () => {
          route('/', () => <div>{'home'}</div>);

          group({ layout: Workspace, auth: requireUser() }, () => {
            route('/dashboard', () => <div>{'dashboard'}</div>);
          });

          fallback(() => <div>{'missing'}</div>);
        });
      },
      {
        auth: {
          resolve: () => ({
            authenticated: true,
            principal: { id: 'user_1' },
            session: null,
            tenant: null,
          }),
        },
      }
    );

    expect(registry.routes.map((item) => item.path).sort()).toEqual(
      ['/', '/dashboard', '/*'].sort()
    );

    const manifest = registry.manifest;
    expect(
      manifest.records.find((record) => record.path === '/dashboard')
        ?.layoutChain
    ).toHaveLength(2);
    expect(
      manifest.records.find((record) => record.path === '/*')?.layoutChain
    ).toHaveLength(1);
  });

  it('should reject nested fallback registrations inside restricted groups', () => {
    expect(() =>
      createRouteRegistry(
        () => {
          group({ auth: requireUser() }, () => {
            fallback(() => <div>{'missing'}</div>);
          });
        },
        {
          auth: {
            resolve: () => ({
              authenticated: true,
              principal: { id: 'user_1' },
              session: null,
              tenant: null,
            }),
          },
        }
      )
    ).toThrow(/fallback\(\) can only be registered at the root scope/i);
  });

  it('should run group access policies outer-to-inner before route policies', async () => {
    const calls: string[] = [];

    const registry = createRouteRegistry(() => {
      group(
        {
          policies: [
            (context) => {
              calls.push(`outer:${context.href}`);
              return allow();
            },
          ],
        },
        () => {
          group(
            {
              policies: [
                (context) => {
                  calls.push(`inner:${context.pathname}`);
                  return allow();
                },
              ],
            },
            () => {
              route('/accounts/{id}', (params) => <div>{params.id}</div>, {
                policies: [
                  (context) => {
                    calls.push(`route:${context.params.id}`);
                    return allow();
                  },
                ],
              });
            }
          );
        }
      );
    });

    const resolved = await resolveRouteRequest(
      '/accounts/acc_42?tab=team#members',
      { registry }
    );

    expect(resolved?.kind).toBe('render');
    expect(calls).toEqual([
      'outer:/accounts/acc_42?tab=team#members',
      'inner:/accounts/acc_42',
      'route:acc_42',
    ]);
  });

  it('should redirect before protected content renders on initial boot', async () => {
    let renderedDashboard = false;

    const registry = createRouteRegistry(
      () => {
        route('/login', () => <div>{'login-page'}</div>, {
          auth: requireAnonymous(),
        });
        group({ auth: requireUser() }, () => {
          route('/dashboard', () => {
            renderedDashboard = true;
            return <div>{'dashboard-page'}</div>;
          });
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

    window.history.replaceState({}, '', '/dashboard?tab=usage#today');
    await createSPA({ root: container, registry });
    await flushScheduler();

    expect(renderedDashboard).toBe(false);
    expect(window.location.pathname).toBe('/login');
    expect(window.location.search).toBe(
      '?next=%2Fdashboard%3Ftab%3Dusage%23today'
    );
    expect(container.textContent).toContain('login-page');
  });

  it('should redirect before protected content renders on navigation', async () => {
    let renderedDashboard = false;

    const registry = createRouteRegistry(
      () => {
        route('/login', () => <div>{'login-page'}</div>, {
          auth: requireAnonymous(),
        });
        group({ auth: requireUser() }, () => {
          route('/dashboard', () => {
            renderedDashboard = true;
            return <div>{'dashboard-page'}</div>;
          });
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

    await createSPA({ root: container, registry });
    await flushScheduler();

    navigate('/dashboard?tab=usage#today');
    await flushScheduler();

    expect(renderedDashboard).toBe(false);
    expect(window.location.pathname).toBe('/login');
    expect(window.location.search).toBe(
      '?next=%2Fdashboard%3Ftab%3Dusage%23today'
    );
  });

  it('should redirect authenticated users away from guest-only routes', async () => {
    const registry = createRouteRegistry(
      () => {
        route('/login', () => <div>{'login-page'}</div>, {
          auth: requireAnonymous(),
        });
        group({ auth: requireUser() }, () => {
          route('/dashboard', () => <div>{'dashboard-page'}</div>);
        });
      },
      {
        auth: {
          resolve: () => ({
            authenticated: true,
            principal: { id: 'user_1' },
            session: null,
            tenant: null,
          }),
          authenticatedRedirectTo: ({ search }) =>
            new URLSearchParams(search).get('next') ?? '/dashboard',
        },
      }
    );

    const resolved = await resolveRouteRequest('/login?next=%2Fdashboard', {
      registry,
    });

    expect(resolved).toEqual({
      kind: 'redirect',
      to: '/dashboard',
      replace: true,
    });
  });

  it('should prefer exact leaf, then page-local fallback, then root fallback in request resolution', async () => {
    const registry = createRouteRegistry(() => {
      page(
        '/docs/components',
        () => <Outlet />,
        () => {
          index(() => <div>{'overview'}</div>);
          route('tabs', () => <div>{'tabs'}</div>);
          fallback(() => <div>{'page-missing'}</div>);
        }
      );

      fallback(() => <div>{'root-missing'}</div>);
    });

    const exact = await resolveRouteRequest('/docs/components/tabs', {
      registry,
    });
    const pageMiss = await resolveRouteRequest(
      '/docs/components/unknown/deeper',
      { registry }
    );
    const rootMiss = await resolveRouteRequest('/outside', { registry });

    expect(exact?.kind).toBe('render');
    expect(pageMiss?.kind).toBe('render');
    expect(rootMiss?.kind).toBe('render');
    expect(exact && exact.kind === 'render' ? exact.params : null).toEqual({});
    expect(
      pageMiss && pageMiss.kind === 'render' ? pageMiss.params : null
    ).toEqual({
      '*': '/unknown/deeper',
    });
    expect(
      rootMiss && rootMiss.kind === 'render' ? rootMiss.params : null
    ).toEqual({
      '*': 'outside',
    });
  });
});
