import {
  resetRouteState,
  currentRouteManifest,
  currentRouteList,
  currentRouteRegistry,
  routeRegistryFromTable,
} from '../../router-test-utils';
import { describe, it, expect, beforeEach, afterEach } from 'vite-plus/test';
import { createSPA, hydrateSPA } from '@askrjs/askr/boot';
import { lazy, route, group, _drainLazy } from '../../../src/router/route';
import { navigate } from '../../../src/router/navigate';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';

function setGlobalWindow(path: string) {
  (global as unknown as { window?: Window }).window = {
    location: { pathname: path, search: '', hash: '' } as Location,
    history: { pushState() {} } as unknown as History,
    addEventListener() {},
    removeEventListener() {},
  } as unknown as Window;
}

beforeEach(() => {
  resetRouteState();
});

afterEach(() => {
  try {
    delete (global as unknown as { window?: Window }).window;
  } catch {
    // ignore: test helper window may not be present
  }
});

describe('lazy()', () => {
  it('should discard stale lazy-route results given a newer navigation when the older route resolves later', async () => {
    const { container, cleanup } = createTestContainer();
    let resolveSlow!: (value: { default: () => unknown }) => void;

    try {
      route('/', () => <div>home</div>);
      route(
        '/slow',
        lazy(
          () =>
            new Promise((resolve) => {
              resolveSlow = resolve;
            })
        )
      );
      route('/newer', () => <div>newer route</div>);
      setGlobalWindow('/');

      await createSPA({ root: container, registry: currentRouteRegistry() });
      navigate('/slow');
      await Promise.resolve();
      navigate('/newer');
      await Promise.resolve();
      flushScheduler();
      expect(container.textContent).toBe('newer route');

      resolveSlow({ default: () => <div>stale route</div> });
      await Promise.resolve();
      await Promise.resolve();
      flushScheduler();

      expect(container.textContent).toBe('newer route');
    } finally {
      cleanup();
    }
  });

  it('should preserve an unmatched route factory during SPA creation', async () => {
    const { container, cleanup } = createTestContainer();
    let imports = 0;

    try {
      route('/', () => <div>home</div>);
      route(
        '/docs',
        lazy(() => {
          imports += 1;
          return Promise.resolve({ default: () => <div>docs</div> });
        })
      );
      setGlobalWindow('/');

      expect(imports).toBe(0);
      await createSPA({ root: container, registry: currentRouteRegistry() });
      flushScheduler();

      expect(imports).toBe(0);
      expect(container.textContent).toBe('home');
    } finally {
      cleanup();
    }
  });

  it('should preserve an unmatched route factory during hydration', async () => {
    const { container, cleanup } = createTestContainer();
    let imports = 0;

    try {
      route('/', () => <div>home</div>);
      route(
        '/docs',
        lazy(() => {
          imports += 1;
          return Promise.resolve({ default: () => <div>docs</div> });
        })
      );
      container.innerHTML = '<div>home</div>';
      setGlobalWindow('/');

      await hydrateSPA({ root: container, registry: currentRouteRegistry() });

      expect(imports).toBe(0);
      expect(container.textContent).toBe('home');
    } finally {
      cleanup();
    }
  });

  it('should invoke only the matched lazy route factory', async () => {
    const { container, cleanup } = createTestContainer();
    const imports: string[] = [];

    try {
      route(
        '/docs',
        lazy(() => {
          imports.push('docs');
          return Promise.resolve({ default: () => <div>docs</div> });
        })
      );
      route(
        '/api',
        lazy(() => {
          imports.push('api');
          return Promise.resolve({ default: () => <div>api</div> });
        })
      );
      setGlobalWindow('/docs');

      await createSPA({ root: container, registry: currentRouteRegistry() });
      flushScheduler();

      expect(imports).toEqual(['docs']);
      expect(container.textContent).toBe('docs');
    } finally {
      cleanup();
    }
  });

  it('should return a synchronous RouteComponent stub', () => {
    const stub = lazy(() => Promise.resolve({ default: () => 'page' }));
    expect(typeof stub).toBe('function');
  });

  it('should resolve to the default export after explicit preload', async () => {
    const Page = () => 'hello';
    const stub = lazy(() => Promise.resolve({ default: Page }));

    await stub.preload();

    expect(stub({})).toBe('hello');
  });

  it('should resolve a module that exports the component directly (no default wrapper)', async () => {
    const Page = () => 'direct';
    const stub = lazy(() =>
      Promise.resolve(Page as unknown as { default: () => string })
    );

    await stub.preload();

    expect(stub({})).toBe('direct');
  });

  it('should pass URL params through to the resolved component', async () => {
    let received: Record<string, string> | null = null;
    const Page = (params: Record<string, string>) => {
      received = params;
      return null;
    };
    const stub = lazy(() => Promise.resolve({ default: Page }));

    await stub.preload();

    stub({ id: '42' });
    expect(received).toEqual({ id: '42' });
  });

  it('should throw before a lazy component is matched or preloaded', () => {
    const stub = lazy(() => new Promise(() => {})); // never resolves

    expect(() => stub({})).toThrow(
      /lazy\(\) component used before it was resolved/i
    );
  });

  it('should propagate import errors when the stub is invoked', async () => {
    const boom = new Error('chunk load failed');
    const stub = lazy(() => Promise.reject(boom));

    await stub.preload();

    expect(() => stub({})).toThrow('chunk load failed');
  });

  it('should preload multiple lazy imports concurrently', async () => {
    const A = () => 'a';
    const B = () => 'b';
    const C = () => 'c';

    const stubA = lazy(() => Promise.resolve({ default: A }));
    const stubB = lazy(() => Promise.resolve({ default: B }));
    const stubC = lazy(() => Promise.resolve({ default: C }));

    await Promise.all([stubA.preload(), stubB.preload(), stubC.preload()]);

    expect(stubA({})).toBe('a');
    expect(stubB({})).toBe('b');
    expect(stubC({})).toBe('c');
  });

  it('should return immediately from _drainLazy when no lazy() calls were made', async () => {
    await expect(_drainLazy()).resolves.toBeUndefined();
  });

  it('should work transparently when used with route()', async () => {
    const Page = (p: Record<string, string>) => `post:${p.slug}`;
    const component = lazy(() => Promise.resolve({ default: Page }));
    route('/posts/{slug}', component);

    await component.preload();

    const { records } = currentRouteManifest();
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

    const component = lazy(() => Promise.resolve({ default: Page }));
    group({ layout: Layout }, () => {
      route('/wrapped', component);
    });

    await component.preload();

    const { records } = currentRouteManifest();
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

      const manifest = currentRouteManifest();
      setGlobalWindow('/lazy-manifest');

      const startup = createSPA({
        root: container,
        registry: currentRouteRegistry(manifest),
      });

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

      const registry = currentRouteRegistry();
      setGlobalWindow('/lazy-routes');

      const startup = createSPA({
        root: container,
        registry,
      });

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
