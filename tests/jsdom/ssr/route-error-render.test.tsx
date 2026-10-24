import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { cleanupApp, hydrateSPA } from '@askrjs/askr/boot';
import {
  createRouteRegistry,
  currentAuth,
  forbidden,
  group,
  layoutData,
  Outlet,
  page,
  route,
} from '@askrjs/askr/router';
import {
  renderRouteRequest,
  renderRouteRequestToString,
} from '@askrjs/askr/ssr';
import { resetRouteState } from '../../router-test-utils';

afterEach(resetRouteState);

const exposed = Object.assign(new Error('db down'), { expose: true });

describe('SSR route error and forbidden components', () => {
  it('should render the error component inside the layouts when a loader fails', async () => {
    const registry = createRouteRegistry(() => {
      page(
        '/app',
        () => (
          <section>
            <Outlet />
          </section>
        ),
        { error: ({ error }) => <p>failed: {(error as Error).message}</p> },
        () => {
          route('x', () => <p>content</p>, {
            loader: async () => {
              throw exposed;
            },
          });
        }
      );
    });
    const result = await renderRouteRequestToString({
      url: '/app/x',
      registry,
    });
    if (result.kind !== 'render') throw new Error('expected render');
    expect(result.status).toBe(500);
    expect(result.error).toBe(exposed);
    expect(result.html).toContain('<section><p>failed: db down</p></section>');
  });

  it('should redact an error that did not opt in to exposure from the page', async () => {
    const secret = new Error('postgres://user:pw@host');
    const registry = createRouteRegistry(() => {
      route('/x', () => <p>content</p>, {
        loader: async () => {
          throw secret;
        },
        error: ({ error }) => <p>{(error as Error).message}</p>,
      });
    });
    const result = await renderRouteRequestToString({ url: '/x', registry });
    if (result.kind !== 'render') throw new Error('expected render');
    expect(result.error).toBe(secret);
    expect(result.html).not.toContain('postgres');
    expect(result.html).toContain('Route failed to render.');
  });

  it('should render the error component when the route fails while rendering', async () => {
    const registry = createRouteRegistry(() => {
      route(
        '/x',
        () => {
          throw exposed;
        },
        { error: ({ error }) => <p>render: {(error as Error).message}</p> }
      );
    });
    const result = await renderRouteRequestToString({ url: '/x', registry });
    if (result.kind !== 'render') throw new Error('expected render');
    expect(result.status).toBe(500);
    expect(result.error).toBe(exposed);
    expect(result.html).toContain('render: db down');
    expect(result.html).not.toContain('content');
  });

  it('should keep the identity and layout data when a failing render falls back to the error component', async () => {
    const navLoader = async () => 'nav';
    const registry = createRouteRegistry(() => {
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
          route(
            '/x',
            () => {
              throw exposed;
            },
            {
              error: ({ error }) => (
                <p>
                  {currentAuth().principal?.id ?? 'anonymous'}:{' '}
                  {(error as Error).message}
                </p>
              ),
            }
          );
        }
      );
    });
    const result = await renderRouteRequestToString({
      url: '/x',
      registry,
      authContext: {
        authenticated: true,
        principal: { id: 'alice' },
        session: null,
        tenant: null,
      },
    });
    if (result.kind !== 'render') throw new Error('expected render');
    expect(result.status).toBe(500);
    expect(result.html).toContain('<h1>nav</h1>');
    expect(result.html).toContain('alice: db down');
  });

  it('should render and hydrate the error component inside a layout that reads group loader data', async () => {
    const navLoader = async () => 'nav';
    const registry = createRouteRegistry(() => {
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
          route('/x', () => <p>content</p>, {
            loader: async () => {
              throw exposed;
            },
            error: ({ error }) => <p>failed: {(error as Error).message}</p>,
          });
        }
      );
    });
    const result = await renderRouteRequestToString({ url: '/x', registry });
    if (result.kind !== 'render') throw new Error('expected render');
    expect(result.status).toBe(500);
    expect(result.html).toContain(
      '<div><h1>nav</h1><p>failed: db down</p></div>'
    );
    const root = document.body.appendChild(document.createElement('div'));
    root.innerHTML = result.html;
    window.history.replaceState({}, '', '/x');
    const mismatch = vi.fn();
    try {
      await hydrateSPA({
        root,
        registry,
        hydrate: { verifyMarkup: true, onMismatch: mismatch },
      });
      expect(mismatch).not.toHaveBeenCalled();
      expect(root.textContent).toBe('navfailed: db down');
    } finally {
      cleanupApp(root);
      root.remove();
    }
  });

  it('should keep the current results when no error component is declared', async () => {
    const registry = createRouteRegistry(() => {
      route('/load', () => <p>x</p>, {
        loader: async () => {
          throw new Error('boom');
        },
      });
      route('/render', () => {
        throw new Error('boom');
      });
    });
    await expect(
      renderRouteRequestToString({ url: '/load', registry })
    ).rejects.toThrow('boom');
    await expect(
      renderRouteRequestToString({ url: '/render', registry })
    ).rejects.toThrow('boom');
  });

  it('should render the forbidden component with the denial status', async () => {
    const registry = createRouteRegistry(() => {
      group({ forbidden: ({ status }) => <p>denied {status}</p> }, () => {
        route('/secret', () => <p>secret</p>, {
          policies: [() => forbidden()],
        });
      });
    });
    const result = await renderRouteRequest({ url: '/secret', registry });
    if (result.kind !== 'render') throw new Error('expected render');
    expect(result.status).toBe(403);
    expect(result.denied).toBe(true);
    expect(result.html).toContain('denied 403');
    expect(result.html).not.toContain('secret');
  });

  it('should keep the deny decision without a forbidden component', async () => {
    const registry = createRouteRegistry(() => {
      route('/secret', () => <p>secret</p>, { policies: [() => forbidden()] });
    });
    const result = await renderRouteRequest({ url: '/secret', registry });
    expect(result).toEqual({ kind: 'deny', status: 403 });
  });

  it('should hydrate a server-rendered error page with the same markup', async () => {
    const registry = createRouteRegistry(() => {
      group(
        {
          layout: ({ children }: { children?: unknown }) => (
            <div>{children as never}</div>
          ),
        },
        () => {
          route('/x', () => <p>content</p>, {
            loader: async () => {
              throw exposed;
            },
            error: ({ error }) => <p>failed: {(error as Error).message}</p>,
          });
        }
      );
    });
    const result = await renderRouteRequestToString({ url: '/x', registry });
    if (result.kind !== 'render') throw new Error('expected render');
    const root = document.body.appendChild(document.createElement('div'));
    root.innerHTML = result.html;
    window.history.replaceState({}, '', '/x');
    const mismatch = vi.fn();
    try {
      await hydrateSPA({
        root,
        registry,
        hydrate: { verifyMarkup: true, onMismatch: mismatch },
      });
      expect(mismatch).not.toHaveBeenCalled();
      expect(root.textContent).toBe('failed: db down');
    } finally {
      cleanupApp(root);
      root.remove();
    }
  });

  it('should hydrate a server-rendered forbidden page with the same markup', async () => {
    const registry = createRouteRegistry(() => {
      route('/secret', () => <p>secret</p>, {
        policies: [() => forbidden()],
        forbidden: ({ status }) => <p>denied {status}</p>,
      });
    });
    const result = await renderRouteRequestToString({
      url: '/secret',
      registry,
    });
    if (result.kind !== 'render') throw new Error('expected render');
    const root = document.body.appendChild(document.createElement('div'));
    root.innerHTML = result.html;
    window.history.replaceState({}, '', '/secret');
    const mismatch = vi.fn();
    try {
      await hydrateSPA({
        root,
        registry,
        hydrate: { verifyMarkup: true, onMismatch: mismatch },
      });
      expect(mismatch).not.toHaveBeenCalled();
      expect(root.textContent).toContain('denied 403');
    } finally {
      cleanupApp(root);
      root.remove();
    }
  });

  it('should keep the buffered result record', async () => {
    const registry = createRouteRegistry(() => {
      route('/x', () => <p>x</p>);
    });
    const result = await renderRouteRequestToString({ url: '/x', registry });
    if (result.kind !== 'render') throw new Error('expected render');
    expect(result.record?.path).toBe('/x');
    expect(Object.keys(result)).not.toContain('record');
  });
});
