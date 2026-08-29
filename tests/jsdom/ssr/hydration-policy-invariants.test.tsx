import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vite-plus/test';
import { requireAnonymous, requireUser } from '@askrjs/auth';
import { cleanupApp, hydrateSPA } from '../../../src/boot';
import { allow, deny } from '../../../src/router/policy';
import {
  renderRouteRequestToString,
  renderToStringSync,
} from '../../../src/ssr';
import {
  createRouteRegistry,
  currentAuth,
  group,
  route,
} from '../../../src/router/route';
import { createTestContainer } from '../../../test-utils/render/test-renderer';

describe('hydration route policy invariants', () => {
  let { container, cleanup } = createTestContainer();

  beforeEach(() => {
    ({ container, cleanup } = createTestContainer());
  });

  afterEach(() => {
    cleanupApp(container);
    cleanup();
    window.history.replaceState({}, '', '/');
  });

  it('should render denied status instead of hydrating protected content', async () => {
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

    window.history.replaceState({}, '', '/private');
    container.innerHTML = renderToStringSync(() => (
      <div data-route-denied="403">{'403'}</div>
    ));
    await hydrateSPA({
      root: container,
      registry,
      hydrate: { verifyMarkup: true },
    });

    expect(renderedProtectedContent).toBe(false);
    expect(container.querySelector('[data-route-denied="403"]')).not.toBeNull();
  });

  it('should follow protected-route redirects before hydrating content', async () => {
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

    window.history.replaceState({}, '', '/dashboard');
    container.innerHTML = renderToStringSync(() => <div>{'login-page'}</div>);
    await hydrateSPA({
      root: container,
      registry,
      hydrate: { verifyMarkup: true },
    });

    expect(renderedDashboard).toBe(false);
    expect(window.location.pathname).toBe('/login');
    expect(container.textContent).toContain('login-page');
  });

  it('should not repeat async route resolution during hydration verification', async () => {
    const resolveAuth = vi.fn(async () => ({
      authenticated: true as const,
      principal: { id: 'verified-user' },
      session: null,
      tenant: null,
    }));
    const policy = vi.fn(async () => allow());
    const loader = vi.fn(async () => ({ ready: true }));
    const registry = createRouteRegistry(
      () => {
        route('/', () => <main>{currentAuth().principal?.id}</main>, {
          policies: [policy],
          loader,
        });
      },
      { auth: { resolve: resolveAuth } }
    );

    const rendered = await renderRouteRequestToString({ url: '/', registry });
    if (rendered.kind !== 'render') throw new Error('expected render');
    container.innerHTML = rendered.html;
    window.history.replaceState({}, '', '/');

    await hydrateSPA({
      root: container,
      registry,
      hydrate: { verifyMarkup: true },
    });

    expect(container.textContent).toContain('verified-user');
    expect(resolveAuth).toHaveBeenCalledTimes(2);
    expect(policy).toHaveBeenCalledTimes(2);
    expect(loader).toHaveBeenCalledTimes(1);
  });
});
