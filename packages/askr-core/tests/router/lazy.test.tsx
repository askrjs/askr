import { describe, it, expect, beforeEach, afterEach } from 'vite-plus/test';
import { createSPA } from '../../src/index';
import {
  lazy,
  route,
  group,
  getManifest,
  getRoutes,
  clearRoutes,
  _drainLazy,
} from '../../src/router/route';
import { createTestContainer, flushScheduler } from '../helpers/test-renderer';

function setGlobalWindow(path: string) {
  (global as unknown as { window?: Window }).window = {
    location: { pathname: path, search: '', hash: '' } as Location,
    history: { pushState() {} } as unknown as History,
    addEventListener() {},
    removeEventListener() {},
  } as unknown as Window;
}

beforeEach(() => {
  clearRoutes();
});

afterEach(() => {
  try {
    delete (global as unknown as { window?: Window }).window;
  } catch {
    // ignore: test helper window may not be present
  }
});

describe('lazy()', () => {
  it('should return a synchronous RouteComponent stub', () => {
    const stub = lazy(() => Promise.resolve({ default: () => 'page' }));
    expect(typeof stub).toBe('function');
  });

  it('should resolve to the default export and render after drain', async () => {
    const Page = () => 'hello';
    const stub = lazy(() => Promise.resolve({ default: Page }));

    await _drainLazy();

    expect(stub({})).toBe('hello');
  });

  it('should resolve a module that exports the component directly (no default wrapper)', async () => {
    const Page = () => 'direct';
    const stub = lazy(() =>
      Promise.resolve(Page as unknown as { default: () => string })
    );

    await _drainLazy();

    expect(stub({})).toBe('direct');
  });

  it('should pass URL params through to the resolved component', async () => {
    let received: Record<string, string> | null = null;
    const Page = (params: Record<string, string>) => {
      received = params;
      return null;
    };
    const stub = lazy(() => Promise.resolve({ default: Page }));

    await _drainLazy();

    stub({ id: '42' });
    expect(received).toEqual({ id: '42' });
  });

  it('should throw before drain if the stub is called while still pending', () => {
    // Don't await — stub should still be pending
    const stub = lazy(() => new Promise(() => {})); // never resolves

    expect(() => stub({})).toThrow(
      /lazy\(\) component used before it was resolved/i
    );
  });

  it('should propagate import errors when the stub is invoked', async () => {
    const boom = new Error('chunk load failed');
    const stub = lazy(() => Promise.reject(boom));

    await _drainLazy();

    expect(() => stub({})).toThrow('chunk load failed');
  });

  it('should drain multiple concurrent lazy imports', async () => {
    const A = () => 'a';
    const B = () => 'b';
    const C = () => 'c';

    const stubA = lazy(() => Promise.resolve({ default: A }));
    const stubB = lazy(() => Promise.resolve({ default: B }));
    const stubC = lazy(() => Promise.resolve({ default: C }));

    await _drainLazy();

    expect(stubA({})).toBe('a');
    expect(stubB({})).toBe('b');
    expect(stubC({})).toBe('c');
  });

  it('should return immediately from _drainLazy when no lazy() calls were made', async () => {
    await expect(_drainLazy()).resolves.toBeUndefined();
  });

  it('should work transparently when used with route()', async () => {
    const Page = (p: Record<string, string>) => `post:${p.slug}`;
    route(
      '/posts/{slug}',
      lazy(() => Promise.resolve({ default: Page }))
    );

    await _drainLazy();

    const { records } = getManifest();
    const record = records.find((r) => r.path === '/posts/{slug}')!;
    expect(record.handler({ slug: 'hello' })).toBe('post:hello');
  });

  it('should work inside a grouped layout scope', async () => {
    const calls: string[] = [];
    const Layout = ({ children }: { children?: unknown }) => {
      calls.push('layout');
      return { type: 'layout', children };
    };
    const Page = () => {
      calls.push('page');
      return 'content';
    };

    group({ layout: Layout }, () => {
      route(
        '/wrapped',
        lazy(() => Promise.resolve({ default: Page }))
      );
    });

    await _drainLazy();

    const { records } = getManifest();
    const record = records.find((r) => r.path === '/wrapped')!;
    calls.length = 0;
    const output = record.handler({}) as { type: string; children: unknown };

    expect(output.type).toBe('layout');
    expect(output.children).toBe('content');
    expect(calls).toEqual(['page', 'layout']);
  });

  it('should wait for manifest lazy imports across createSPA boot reset', async () => {
    const t = createTestContainer();
    const { container, cleanup } = t;
    let resolveModule: ((value: { default: () => unknown }) => void) | null =
      null;

    try {
      route(
        '/lazy-manifest',
        lazy(
          () =>
            new Promise<{ default: () => unknown }>((resolve) => {
              resolveModule = resolve;
            })
        )
      );

      const manifest = getManifest();
      setGlobalWindow('/lazy-manifest');

      const startup = createSPA({ root: container, manifest });

      let settled = false;
      startup.then(() => {
        settled = true;
      });

      await Promise.resolve();
      expect(settled).toBe(false);

      if (resolveModule) {
        resolveModule({
          default: () => <div class="lazy-manifest">lazy manifest</div>,
        });
      }

      await expect(startup).resolves.toBeUndefined();
      flushScheduler();

      expect(container.querySelector('.lazy-manifest')?.textContent).toBe(
        'lazy manifest'
      );
    } finally {
      cleanup();
    }
  });

  it('should wait for route-table lazy imports across createSPA boot reset', async () => {
    const t = createTestContainer();
    const { container, cleanup } = t;
    let resolveModule: ((value: { default: () => unknown }) => void) | null =
      null;

    try {
      route(
        '/lazy-routes',
        lazy(
          () =>
            new Promise<{ default: () => unknown }>((resolve) => {
              resolveModule = resolve;
            })
        )
      );

      const routes = getRoutes();
      setGlobalWindow('/lazy-routes');

      const startup = createSPA({ root: container, routes });

      let settled = false;
      startup.then(() => {
        settled = true;
      });

      await Promise.resolve();
      expect(settled).toBe(false);

      if (resolveModule) {
        resolveModule({
          default: () => <div class="lazy-routes">lazy routes</div>,
        });
      }

      await expect(startup).resolves.toBeUndefined();
      flushScheduler();

      expect(container.querySelector('.lazy-routes')?.textContent).toBe(
        'lazy routes'
      );
    } finally {
      cleanup();
    }
  });
});
