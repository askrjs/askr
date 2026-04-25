import { beforeEach, describe, expect, it } from 'vite-plus/test';
import { createSPA } from '../../../src/boot';
import {
  clearRoutes,
  getManifest,
  redirect,
  deny,
  navigate,
  route,
} from '../../../src/router';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';

async function settleNavigation(): Promise<void> {
  for (let index = 0; index < 3; index += 1) {
    await Promise.resolve();
    flushScheduler();
  }
}

describe('guarded router navigation coverage', () => {
  beforeEach(() => {
    clearRoutes();
    window.history.replaceState({}, '', '/');
  });

  it('should render denied route status when a guard denies navigation', async () => {
    route('/', () => <div>{'home'}</div>);
    route('/admin', () => <div>{'admin'}</div>, {
      policies: [() => deny(403)],
    });

    const { container, cleanup } = createTestContainer();
    try {
      await createSPA({ root: container, manifest: getManifest() });
      flushScheduler();

      navigate('/admin');
      await settleNavigation();

      expect(container.textContent).toBe('403');
      expect(
        container.querySelector('[data-route-denied="403"]')
      ).not.toBeNull();
      expect(window.location.pathname).toBe('/admin');
    } finally {
      cleanup();
    }
  });

  it('should resolve async guard redirects before rendering protected content', async () => {
    let protectedRendered = false;
    route('/', () => <div>{'home'}</div>);
    route('/login', () => <h1>{'login'}</h1>);
    route(
      '/private',
      () => {
        protectedRendered = true;
        return <div>{'private'}</div>;
      },
      {
        policies: [async () => redirect('/login?next=/private')],
      }
    );

    const { container, cleanup } = createTestContainer();
    try {
      await createSPA({ root: container, manifest: getManifest() });
      flushScheduler();

      navigate('/private');
      await settleNavigation();

      expect(protectedRendered).toBe(false);
      expect(window.location.pathname).toBe('/login');
      expect(window.location.search).toBe('?next=/private');
      expect(container.textContent).toBe('login');
    } finally {
      cleanup();
    }
  });
});
