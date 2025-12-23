import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  createSPA,
  renderToStringSync,
  navigate,
  setServerLocation,
  type RouteSnapshot,
} from '../../src/index';
import { createTestContainer, flushScheduler } from '../helpers/test-renderer';
import { route } from '../../src/index';

// Minimal testing window type helpers to avoid `any` casts
type TestWindow = {
  location: { pathname: string; search?: string; hash?: string };
  history: { pushState(...args: unknown[]): void };
  addEventListener: (...args: unknown[]) => void;
  removeEventListener: (...args: unknown[]) => void;
};

function setGlobalWindow(w?: TestWindow) {
  (global as unknown as { window?: TestWindow }).window = w;
}

function updateGlobalPath(path: string) {
  const gw = (global as unknown as { window?: TestWindow }).window;
  if (gw && gw.location) gw.location.pathname = path;
  else
    setGlobalWindow({
      location: { pathname: path },
      history: { pushState() {} },
      addEventListener() {},
      removeEventListener() {},
    });
}

describe('route accessor (public)', () => {
  let container: HTMLElement;
  let cleanup: () => void;

  beforeEach(() => {
    const t = createTestContainer();
    container = t.container;
    cleanup = t.cleanup;
  });

  afterEach(() => {
    cleanup();
    setServerLocation(null);
  });

  it('should throw when called outside render', () => {
    expect(() => (route as () => unknown)()).toThrow(
      /route\(\) can only be called/
    );
  });

  it('should return params and keep snapshot immutable', async () => {
    let snapDuringRender: RouteSnapshot | null = null;

    const routes = [
      {
        path: '/users/{id}',
        handler: (_params: Record<string, string>) => {
          const s = route();
          snapDuringRender = s as RouteSnapshot;
          return { type: 'div', props: {}, children: [`user:${s.params.id}`] };
        },
      },
    ];

    // mount app
    // Provide a minimal window object expected by initializeNavigation
    setGlobalWindow({
      location: { pathname: '/', search: '', hash: '' },
      history: { pushState() {} },
      addEventListener() {},
      removeEventListener() {},
    });
    await createSPA({ root: container, routes });

    // navigate to user 42
    updateGlobalPath('/users/42');
    navigate('/users/42');
    await flushScheduler();

    expect(container.textContent).toBe('user:42');
    expect(snapDuringRender).not.toBeNull();
    expect(Object.isFrozen(snapDuringRender!)).toBe(true);
    expect(Object.isFrozen(snapDuringRender!.params)).toBe(true);

    // mutation attempt should not change value
    try {
      (snapDuringRender!.params as unknown as Record<string, string>).id = 'x';
    } catch {
      /* may throw in strict mode */
    }
    expect(snapDuringRender!.params.id).toBe('42');
  });

  it('should re-render on navigation', async () => {
    const routes = [
      {
        path: '/home',
        handler: () => ({ type: 'div', props: {}, children: ['home'] }),
      },
      {
        path: '/users/{id}',
        handler: (params: Record<string, string>) => ({
          type: 'div',
          props: {},
          children: [`user:${params.id}`],
        }),
      },
    ];

    // Provide a minimal window object expected by initializeNavigation
    setGlobalWindow({
      location: { pathname: '/home', search: '', hash: '' },
      history: { pushState() {} },
      addEventListener() {},
      removeEventListener() {},
    });

    await createSPA({ root: container, routes });

    navigate('/home');
    await flushScheduler();
    expect(container.textContent).toBe('home');

    updateGlobalPath('/users/5');
    navigate('/users/5');
    await flushScheduler();
    expect(container.textContent).toBe('user:5');
  });

  it('should preserve SSR/hydration equivalence for path, query, hash and params', async () => {
    route('/items/{id}', (params) => ({
      type: 'div',
      props: {},
      children: [
        `${params.id}|${route().query.get('q') || ''}|${route().hash || ''}`,
      ],
    }));

    // Server render with explicit URL
    setServerLocation('/items/99?q=abc#frag');
    // Remove any global window to simulate server environment
    try {
      delete (global as unknown as { window?: TestWindow }).window;
    } catch {
      /* ignore - window may not be deletable in some environments */
    }

    const ServerComp = () => ({
      type: 'div',
      props: {},
      children: [
        `${route().path}|${route().query.get('q') || ''}|${route().hash || ''}`,
      ],
    });

    const html = renderToStringSync(ServerComp);

    expect(html).toContain('/items/99');
    expect(html).toContain('abc');

    // Hydrate on client with same location
    setGlobalWindow({
      location: { pathname: '/items/99', search: '?q=abc', hash: '#frag' },
      history: { pushState() {} },
      addEventListener() {},
      removeEventListener() {},
    });

    await createSPA({
      root: container,
      routes: [
        {
          path: '/items/{id}',
          handler: (params: Record<string, string>) => ({
            type: 'div',
            props: {},
            children: [
              `${params.id}|${route().query.get('q') || ''}|${route().hash || ''}`,
            ],
          }),
        },
      ],
    });

    // Mount route handler by navigating to the path
    navigate('/items/99');
    await flushScheduler();

    // Expect the client hydration render to match server snapshot values
    expect(container.textContent).toBe('99|abc|#frag');
  });
});
