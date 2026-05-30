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
  clearRoutes,
  getManifest,
  resolveRouteRequest,
  route,
} from '../../../src/router/route';
import { navigate } from '../../../src/router/navigate';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';

describe('router async invariants', () => {
  let { container, cleanup } = createTestContainer();

  beforeEach(() => {
    ({ container, cleanup } = createTestContainer());
    clearRoutes();
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

    await createSPA({ root: container, manifest: getManifest() });
    navigate('/slow');
    cleanupApp(container);
    await Promise.resolve();
    flushScheduler();

    expect(guardAborted).toBe(true);
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
      createSPA({ root: container, manifest: getManifest() })
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

    await createSPA({ root: container, manifest: getManifest() });

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

    await expect(resolveRouteRequest('/private')).resolves.toEqual(
      redirect('/login')
    );
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

      await createSPA({ root: container, manifest: getManifest() });
      navigate('/private');
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(consoleError).toHaveBeenCalledWith(
        '[Askr] navigation failed:',
        policyError
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

      await createSPA({ root: container, manifest: getManifest() });

      expect(() => navigate('/a')).not.toThrow();
      await new Promise((resolve) => setTimeout(resolve, 0));

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
