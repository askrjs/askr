import { describe, it, expect, beforeEach, afterEach } from 'vite-plus/test';
import { createSPA } from '../../../src/index';
import { navigate } from '../../../src/router/navigate';
import { allow } from '../../../src/router/policy';
import {
  clearRoutes,
  fallback,
  getManifest,
  getRoutes,
  group,
  registerRoutes,
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
    clearRoutes();
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

    registerRoutes(
      () => {
        group({ layout: Root }, () => {
          route('/', () => <div>{'home'}</div>);

          group({ layout: Workspace, auth: true }, () => {
            route('/dashboard', () => <div>{'dashboard'}</div>);
          });

          fallback(() => <div>{'missing'}</div>);
        });
      },
      {
        auth: {
          resolve: () => ({
            session: { id: 'session_1' },
            user: { id: 'user_1' },
          }),
        },
      }
    );

    expect(
      getRoutes()
        .map((item) => item.path)
        .sort()
    ).toEqual(['/', '/dashboard', '/*'].sort());

    const manifest = getManifest();
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
      registerRoutes(
        () => {
          group({ auth: true }, () => {
            fallback(() => <div>{'missing'}</div>);
          });
        },
        {
          auth: {
            resolve: () => ({
              session: { id: 'session_1' },
              user: { id: 'user_1' },
            }),
          },
        }
      )
    ).toThrow(/fallback\(\) can only be registered at the root scope/i);
  });

  it('should run group access policies outer-to-inner before route policies', async () => {
    const calls: string[] = [];

    registerRoutes(() => {
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
      '/accounts/acc_42?tab=team#members'
    );

    expect(resolved?.kind).toBe('render');
    expect(calls).toEqual([
      'outer:/accounts/acc_42?tab=team#members',
      'inner:/accounts/acc_42',
      'route:acc_42',
    ]);
  });

  it('should require auth configuration for built-in auth metadata', () => {
    expect(() =>
      registerRoutes(() => {
        route('/admin', () => <div>{'admin'}</div>, { role: 'admin' });
      })
    ).toThrow(/auth\.resolve/i);
  });

  it('should reject guest-only routes inside authenticated scopes', () => {
    expect(() =>
      registerRoutes(
        () => {
          group({ auth: true }, () => {
            route('/login', () => <div>{'login'}</div>, { auth: 'guest' });
          });
        },
        {
          auth: {
            resolve: () => ({
              session: { id: 'session_1' },
              user: { id: 'user_1' },
            }),
          },
        }
      )
    ).toThrow(/guest-only routes cannot be combined/i);
  });

  it('should redirect before protected content renders on initial boot', async () => {
    let renderedDashboard = false;

    registerRoutes(
      () => {
        route('/login', () => <div>{'login-page'}</div>, { auth: 'guest' });
        group({ auth: true }, () => {
          route('/dashboard', () => {
            renderedDashboard = true;
            return <div>{'dashboard-page'}</div>;
          });
        });
      },
      {
        auth: {
          resolve: () => ({ session: null, user: null }),
          loginPath: '/login',
        },
      }
    );

    window.history.replaceState({}, '', '/dashboard?tab=usage#today');
    await createSPA({ root: container, manifest: getManifest() });
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

    registerRoutes(
      () => {
        route('/login', () => <div>{'login-page'}</div>, { auth: 'guest' });
        group({ auth: true }, () => {
          route('/dashboard', () => {
            renderedDashboard = true;
            return <div>{'dashboard-page'}</div>;
          });
        });
      },
      {
        auth: {
          resolve: () => ({ session: null, user: null }),
          loginPath: '/login',
        },
      }
    );

    await createSPA({ root: container, manifest: getManifest() });
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
    registerRoutes(
      () => {
        route('/login', () => <div>{'login-page'}</div>, { auth: 'guest' });
        group({ auth: true }, () => {
          route('/dashboard', () => <div>{'dashboard-page'}</div>);
        });
      },
      {
        auth: {
          resolve: () => ({
            session: { id: 'session_1' },
            user: { id: 'user_1' },
          }),
          guestRedirectTo: ({ search }) =>
            new URLSearchParams(search).get('next') ?? '/dashboard',
        },
      }
    );

    const resolved = await resolveRouteRequest('/login?next=%2Fdashboard');

    expect(resolved).toEqual({
      kind: 'redirect',
      to: '/dashboard',
      replace: true,
    });
  });
});
