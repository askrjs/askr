import {
  resetRouteState,
  currentRouteManifest,
  currentRouteList,
  currentRouteRegistry,
  routeRegistryFromTable,
} from '../../router-test-utils';
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { createSPA } from '../../../src/boot';
import { allow, redirect, deny, navigate, route } from '../../../src/router';
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
    resetRouteState();
    window.history.replaceState({}, '', '/');
  });

  it('should render denied route status when a guard denies navigation', async () => {
    route('/', () => <div>{'home'}</div>);
    route('/admin', () => <div>{'admin'}</div>, {
      policies: [() => deny(403)],
    });

    const { container, cleanup } = createTestContainer();
    try {
      await createSPA({ root: container, registry: currentRouteRegistry() });
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
      await createSPA({ root: container, registry: currentRouteRegistry() });
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

  it('should honor redirect replace=false during guarded SPA navigation', async () => {
    route('/', () => <div>{'home'}</div>);
    route('/login', () => <h1>{'login'}</h1>);
    route('/private', () => <div>{'private'}</div>, {
      policies: [() => redirect('/login', { replace: false })],
    });

    const { container, cleanup } = createTestContainer();
    try {
      await createSPA({ root: container, registry: currentRouteRegistry() });
      flushScheduler();

      const pushStateSpy = vi.spyOn(window.history, 'pushState');
      const replaceStateSpy = vi.spyOn(window.history, 'replaceState');

      navigate('/private');
      await settleNavigation();

      expect(pushStateSpy).toHaveBeenCalledWith(
        expect.objectContaining({ path: '/login' }),
        '',
        '/login'
      );
      expect(replaceStateSpy).not.toHaveBeenCalledWith(
        expect.objectContaining({ path: '/login' }),
        '',
        '/login'
      );
      expect(window.location.pathname).toBe('/login');
      expect(container.textContent).toBe('login');

      pushStateSpy.mockRestore();
      replaceStateSpy.mockRestore();
    } finally {
      cleanup();
    }
  });

  it('should ignore stale async guarded navigations after a newer navigation wins', async () => {
    let releaseSlowGuard: (() => void) | null = null;

    route('/', () => <div>{'home'}</div>);
    route('/slow', () => <div>{'slow'}</div>, {
      policies: [
        () =>
          new Promise((resolve) => {
            releaseSlowGuard = () => resolve(allow());
          }),
      ],
    });
    route('/fast', () => <div>{'fast'}</div>);

    const { container, cleanup } = createTestContainer();
    try {
      await createSPA({ root: container, registry: currentRouteRegistry() });
      flushScheduler();

      navigate('/slow');
      navigate('/fast');
      await settleNavigation();

      expect(container.textContent).toBe('fast');
      expect(window.location.pathname).toBe('/fast');

      releaseSlowGuard?.();
      await settleNavigation();

      expect(container.textContent).toBe('fast');
      expect(window.location.pathname).toBe('/fast');
    } finally {
      cleanup();
    }
  });

  it('should keep the newest guarded navigation when guards resolve out of order', async () => {
    let releaseFirstGuard: (() => void) | null = null;
    let releaseSecondGuard: (() => void) | null = null;
    const rendered: string[] = [];

    route('/', () => <div>{'home'}</div>);
    route(
      '/first',
      () => {
        rendered.push('first');
        return <div>{'first'}</div>;
      },
      {
        policies: [
          () =>
            new Promise((resolve) => {
              releaseFirstGuard = () => resolve(allow());
            }),
        ],
      }
    );
    route(
      '/second',
      () => {
        rendered.push('second');
        return <div>{'second'}</div>;
      },
      {
        policies: [
          () =>
            new Promise((resolve) => {
              releaseSecondGuard = () => resolve(allow());
            }),
        ],
      }
    );

    const { container, cleanup } = createTestContainer();
    try {
      await createSPA({ root: container, registry: currentRouteRegistry() });
      flushScheduler();

      navigate('/first');
      navigate('/second');
      await Promise.resolve();

      releaseSecondGuard?.();
      await settleNavigation();

      expect(container.textContent).toBe('second');
      expect(window.location.pathname).toBe('/second');
      expect(rendered).toEqual(['second']);

      releaseFirstGuard?.();
      await settleNavigation();

      expect(container.textContent).toBe('second');
      expect(window.location.pathname).toBe('/second');
      expect(rendered).toEqual(['second']);
    } finally {
      cleanup();
    }
  });

  it('should abort superseded guarded navigation signals', async () => {
    let guardAborted = false;

    route('/', () => <div>{'home'}</div>);
    route('/slow', () => <div>{'slow'}</div>, {
      policies: [
        ({ signal }) =>
          new Promise((resolve) => {
            signal.addEventListener(
              'abort',
              () => {
                guardAborted = true;
                resolve(allow());
              },
              { once: true }
            );
          }),
      ],
    });
    route('/fast', () => <div>{'fast'}</div>);

    const { container, cleanup } = createTestContainer();
    try {
      await createSPA({ root: container, registry: currentRouteRegistry() });
      flushScheduler();

      navigate('/slow');
      navigate('/fast');
      await settleNavigation();

      expect(container.textContent).toBe('fast');
      expect(guardAborted).toBe(true);
    } finally {
      cleanup();
    }
  });
});
