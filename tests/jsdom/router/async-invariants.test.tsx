import { resetRouteState, currentRouteRegistry } from '../../router-test-utils';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vite-plus/test';
import { cleanupApp, createSPA } from '../../../src/boot';
import { allow, redirect } from '../../../src/router/policy';
import {
  currentAuth,
  resolveRouteRequest,
  route,
} from '../../../src/router/route';
import { navigate } from '../../../src/router/navigate';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';

async function settleAsyncNavigation(): Promise<void> {
  for (let turn = 0; turn < 6; turn += 1) await Promise.resolve();
}

describe('router async invariants', () => {
  let { container, cleanup } = createTestContainer();

  beforeEach(() => {
    ({ container, cleanup } = createTestContainer());
    resetRouteState();
    window.history.replaceState({}, '', '/');
  });

  afterEach(() => {
    cleanupApp(container);
    cleanup();
    window.history.replaceState({}, '', '/');
  });

  it('should abort an in-flight guard when the app is cleaned up', async () => {
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

    await createSPA({ root: container, registry: currentRouteRegistry() });
    navigate('/slow');
    cleanupApp(container);
    await Promise.resolve();
    flushScheduler();

    expect(guardAborted).toBe(true);
  });

  it('should not let abandoned auth resolution overwrite the committed navigation', async () => {
    const slowAuth = {
      authenticated: false,
      principal: null,
      session: null,
      tenant: null,
    };
    const fastAuth = {
      authenticated: true,
      principal: { id: 'fast-user', roles: ['member'] },
      session: null,
      tenant: null,
    };
    let resolveSlowAuth!: (value: typeof slowAuth) => void;

    route('/', () => <div>{'home'}</div>);
    route('/slow-auth', () => <div>{'slow'}</div>);
    route('/fast-auth', () => <div>{'fast'}</div>);

    await createSPA({
      root: container,
      registry: currentRouteRegistry(),
      auth: {
        resolve: ({ pathname }) => {
          if (pathname === '/slow-auth') {
            return new Promise((resolve) => {
              resolveSlowAuth = resolve;
            });
          }
          return pathname === '/fast-auth' ? fastAuth : slowAuth;
        },
      },
    });

    navigate('/slow-auth');
    await Promise.resolve();
    navigate('/fast-auth');
    await Promise.resolve();
    await Promise.resolve();
    flushScheduler();

    expect(container.textContent).toBe('fast');
    expect(currentAuth().principal?.id).toBe('fast-user');

    resolveSlowAuth(slowAuth);
    await Promise.resolve();
    await Promise.resolve();
    flushScheduler();

    expect(container.textContent).toBe('fast');
    expect(currentAuth().principal?.id).toBe('fast-user');
  });

  it('should fail bounded initial redirect cycles', async () => {
    route('/a', () => <div>{'a'}</div>, {
      policies: [() => redirect('/b')],
    });
    route('/b', () => <div>{'b'}</div>, {
      policies: [() => redirect('/a')],
    });
    window.history.replaceState({}, '', '/a');

    await expect(
      createSPA({ root: container, registry: currentRouteRegistry() })
    ).rejects.toThrow(/redirect cycle/i);
  });

  it('should fail bounded navigation redirect cycles', async () => {
    route('/', () => <div>{'home'}</div>);
    route('/a', () => <div>{'a'}</div>, {
      policies: [() => redirect('/b')],
    });
    route('/b', () => <div>{'b'}</div>, {
      policies: [() => redirect('/a')],
    });

    await createSPA({ root: container, registry: currentRouteRegistry() });

    expect(() => navigate('/a')).toThrow(/redirect cycle/i);
  });

  it('should continue route policies after a thenable allow decision', async () => {
    route('/private', () => <div>{'private'}</div>, {
      policies: [
        () =>
          ({
            // eslint-disable-next-line unicorn/no-thenable -- Intentional PromiseLike regression fixture.
            then(resolve: (value: ReturnType<typeof allow>) => void) {
              resolve(allow());
            },
          }) as unknown as Promise<ReturnType<typeof allow>>,
        () => redirect('/login'),
      ],
    });

    await expect(
      resolveRouteRequest('/private', { registry: currentRouteRegistry() })
    ).resolves.toEqual(redirect('/login'));
  });

  it('should handle rejected async navigation policies without an unhandled rejection', async () => {
    const policyError = new Error('policy failed');
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    try {
      route('/', () => <div>{'home'}</div>);
      route('/private', () => <div>{'private'}</div>, {
        policies: [() => Promise.reject(policyError)],
      });

      await createSPA({ root: container, registry: currentRouteRegistry() });
      navigate('/private');
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();

      expect(consoleError).toHaveBeenCalledWith(
        '[Askr] navigation failed:',
        policyError
      );
    } finally {
      consoleError.mockRestore();
    }
  });

  it('should not log a rejected preload after a newer navigation aborts its request', async () => {
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    try {
      route('/', () => <div>{'home'}</div>);
      route('/slow', () => <div>{'slow'}</div>, {
        preload: ({ signal }) =>
          new Promise((_resolve, reject) => {
            signal.addEventListener(
              'abort',
              () => reject(new DOMException('superseded', 'AbortError')),
              { once: true }
            );
          }),
      });
      route('/fast', () => <div>{'fast'}</div>);

      await createSPA({ root: container, registry: currentRouteRegistry() });
      navigate('/slow');
      await Promise.resolve();
      navigate('/fast');
      await settleAsyncNavigation();
      flushScheduler();

      expect(container.textContent).toBe('fast');
      expect(consoleError).not.toHaveBeenCalled();
    } finally {
      consoleError.mockRestore();
    }
  });

  it('should not log a rejected popstate policy after a newer request supersedes it', async () => {
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    try {
      route('/', () => <div>{'home'}</div>);
      route('/slow', () => <div>{'slow'}</div>, {
        policies: [
          ({ signal }) =>
            new Promise((_resolve, reject) => {
              signal.addEventListener(
                'abort',
                () => reject(new DOMException('superseded', 'AbortError')),
                { once: true }
              );
            }),
        ],
      });
      route('/fast', () => <div>{'fast'}</div>);

      await createSPA({ root: container, registry: currentRouteRegistry() });
      window.history.pushState({}, '', '/slow');
      window.dispatchEvent(new PopStateEvent('popstate', { state: {} }));
      await Promise.resolve();
      window.history.pushState({}, '', '/fast');
      window.dispatchEvent(new PopStateEvent('popstate', { state: {} }));
      await settleAsyncNavigation();
      flushScheduler();

      expect(container.textContent).toBe('fast');
      expect(consoleError).not.toHaveBeenCalled();
    } finally {
      consoleError.mockRestore();
    }
  });

  it('should still report an AbortError from the active navigation request', async () => {
    const abortError = new DOMException('active failure', 'AbortError');
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    try {
      route('/', () => <div>{'home'}</div>);
      route('/active-abort', () => <div>{'unreachable'}</div>, {
        policies: [() => Promise.reject(abortError)],
      });

      await createSPA({ root: container, registry: currentRouteRegistry() });
      navigate('/active-abort');
      await settleAsyncNavigation();

      expect(consoleError).toHaveBeenCalledWith(
        '[Askr] navigation failed:',
        abortError
      );
    } finally {
      consoleError.mockRestore();
    }
  });

  it('should log async redirect cycles instead of leaking unhandled rejections', async () => {
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    try {
      route('/', () => <div>{'home'}</div>);
      route('/a', () => <div>{'a'}</div>, {
        policies: [() => Promise.resolve(redirect('/b'))],
      });
      route('/b', () => <div>{'b'}</div>, {
        policies: [() => redirect('/a')],
      });

      await createSPA({ root: container, registry: currentRouteRegistry() });

      expect(() => navigate('/a')).not.toThrow();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();

      expect(consoleError).toHaveBeenCalledWith(
        '[Askr] navigation failed:',
        expect.objectContaining({
          message: expect.stringMatching(/redirect cycle/i),
        })
      );
    } finally {
      consoleError.mockRestore();
    }
  });
});
