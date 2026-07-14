import { afterEach, beforeEach, describe, expect, it } from 'vite-plus/test';
import { requireAnonymous, requireUser } from '@askrjs/auth';
import { cleanupApp, hydrateSPA } from '../../../src/boot';
import { deny } from '../../../src/router/policy';
import { renderToStringSync } from '../../../src/ssr';
import {
  getManifest,
  group,
  registerRoutes,
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

    registerRoutes(() => {
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
      manifest: getManifest(),
      hydrate: { verifyMarkup: true },
    });

    expect(renderedProtectedContent).toBe(false);
    expect(container.querySelector('[data-route-denied="403"]')).not.toBeNull();
  });

  it('should follow protected-route redirects before hydrating content', async () => {
    let renderedDashboard = false;

    registerRoutes(
      () => {
        route('/login', () => <div>{'login-page'}</div>, { auth: requireAnonymous() });
        group({ auth: requireUser() }, () => {
          route('/dashboard', () => {
            renderedDashboard = true;
            return <div>{'dashboard-page'}</div>;
          });
        });
      },
      {
        auth: {
          resolve: () => ({ authenticated: false, principal: null, session: null, tenant: null }),
          loginPath: '/login',
        },
      }
    );

    window.history.replaceState({}, '', '/dashboard');
    container.innerHTML = renderToStringSync(() => <div>{'login-page'}</div>);
    await hydrateSPA({
      root: container,
      manifest: getManifest(),
      hydrate: { verifyMarkup: true },
    });

    expect(renderedDashboard).toBe(false);
    expect(window.location.pathname).toBe('/login');
    expect(container.textContent).toContain('login-page');
  });
});
