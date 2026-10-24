import { resetRouteState } from '../../router-test-utils';
import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  vi,
} from 'vite-plus/test';
import { createSPA } from '@askrjs/askr/boot';
import { navigate } from '../../../src/router/navigate';
import {
  createRouteRegistry,
  group,
  Outlet,
  page,
  route,
} from '../../../src/router/route';
import { forbidden } from '../../../src/router/policy';
import { layoutData } from '../../../src/router';
import { createTestContainer } from '../../../test-utils/render/test-renderer';
import { logger } from '../../../src/common/logger';

vi.mock('../../../src/router/document-navigation', () => ({
  loadDocument: vi.fn(),
  reloadDocument: vi.fn(),
}));

describe('route error and forbidden components', () => {
  let { container, cleanup } = createTestContainer();

  beforeEach(() => {
    ({ container, cleanup } = createTestContainer());
    resetRouteState();
    window.history.replaceState({}, '', '/');
    vi.spyOn(logger, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('should render the error component at the destination URL when a loader fails', async () => {
    const registry = createRouteRegistry(() => {
      route('/', () => <p>home</p>);
      route('/broken', () => <p>content</p>, {
        loader: async () => {
          throw new Error('boom');
        },
        error: ({ error }) => <p>failed: {(error as Error).message}</p>,
      });
    });
    await createSPA({ root: container, registry });

    navigate('/broken');
    await vi.waitFor(() => expect(container.textContent).toBe('failed: boom'));
    expect(window.location.pathname).toBe('/broken');
  });

  it('should render the error component inside layouts that read the group loader data that did load', async () => {
    const navLoader = async () => 'nav';
    const registry = createRouteRegistry(() => {
      route('/', () => <p>home</p>);
      group(
        {
          loader: navLoader,
          layout: ({ children }: { children?: unknown }) => (
            <div>
              <h1>{layoutData(navLoader)}</h1>
              {children as never}
            </div>
          ),
        },
        () => {
          route('/broken', () => <p>content</p>, {
            loader: async () => {
              throw new Error('boom');
            },
            error: ({ error }) => <p>failed: {(error as Error).message}</p>,
          });
        }
      );
    });
    await createSPA({ root: container, registry });

    navigate('/broken');
    await vi.waitFor(() =>
      expect(container.textContent).toBe('navfailed: boom')
    );
    expect(window.location.pathname).toBe('/broken');
  });

  it('should re-resolve the route when the error component calls retry', async () => {
    let attempts = 0;
    const registry = createRouteRegistry(() => {
      route('/', () => <p>home</p>);
      route('/flaky', () => <p>content</p>, {
        loader: async () => {
          attempts += 1;
          if (attempts === 1) throw new Error('first');
          return 'ok';
        },
        error: ({ retry }) => (
          <button type="button" onClick={retry}>
            retry
          </button>
        ),
      });
    });
    await createSPA({ root: container, registry });
    navigate('/flaky');
    await vi.waitFor(() =>
      expect(container.querySelector('button')).not.toBe(null)
    );

    container.querySelector('button')!.click();
    await vi.waitFor(() => expect(container.textContent).toBe('content'));
    expect(attempts).toBe(2);
    expect(window.location.pathname).toBe('/flaky');
  });

  it('should prefer the nearest declaring route, page or group', async () => {
    const registry = createRouteRegistry(() => {
      route('/', () => <p>home</p>);
      group({ error: () => <p>group error</p> }, () => {
        route('/a', () => <p>a</p>, {
          loader: async () => {
            throw new Error('a');
          },
        });
        page(
          '/docs',
          () => (
            <section>
              <Outlet />
            </section>
          ),
          { error: () => <p>page error</p> },
          () => {
            route('b', () => <p>b</p>, {
              loader: async () => {
                throw new Error('b');
              },
            });
            route('c', () => <p>c</p>, {
              loader: async () => {
                throw new Error('c');
              },
              error: () => <p>route error</p>,
            });
          }
        );
      });
    });
    await createSPA({ root: container, registry });

    navigate('/a');
    await vi.waitFor(() => expect(container.textContent).toBe('group error'));
    navigate('/docs/b');
    await vi.waitFor(() =>
      expect(container.textContent).toContain('page error')
    );
    navigate('/docs/c');
    await vi.waitFor(() =>
      expect(container.textContent).toContain('route error')
    );
  });

  it('should keep the current page and log when no error component is declared', async () => {
    const registry = createRouteRegistry(() => {
      route('/', () => <p>home</p>);
      route('/broken', () => <p>content</p>, {
        loader: async () => {
          throw new Error('boom');
        },
      });
    });
    await createSPA({ root: container, registry });

    navigate('/broken');
    await vi.waitFor(() => expect(logger.error).toHaveBeenCalled());
    expect(container.textContent).toBe('home');
    expect(window.location.pathname).toBe('/');
  });

  it('should render the error component for a failing initial route', async () => {
    window.history.replaceState({}, '', '/broken');
    const registry = createRouteRegistry(() => {
      route('/broken', () => <p>content</p>, {
        loader: async () => {
          throw new Error('boom');
        },
        error: () => <p>initial error</p>,
      });
    });
    await createSPA({ root: container, registry });
    expect(container.textContent).toBe('initial error');
  });

  it('should render the forbidden component with the denial status', async () => {
    const registry = createRouteRegistry(() => {
      route('/', () => <p>home</p>);
      group({ forbidden: ({ status }) => <p>denied {status}</p> }, () => {
        route('/secret', () => <p>secret</p>, {
          policies: [() => forbidden()],
        });
      });
    });
    await createSPA({ root: container, registry });

    navigate('/secret');
    await vi.waitFor(() => expect(container.textContent).toBe('denied 403'));
    expect(container.querySelector('[data-route-denied]')).toBe(null);
  });

  it('should keep the status placeholder when no forbidden component is declared', async () => {
    const registry = createRouteRegistry(() => {
      route('/', () => <p>home</p>);
      route('/secret', () => <p>secret</p>, { policies: [() => forbidden()] });
    });
    await createSPA({ root: container, registry });

    navigate('/secret');
    await vi.waitFor(() =>
      expect(container.querySelector('[data-route-denied="403"]')).not.toBe(
        null
      )
    );
  });
});
