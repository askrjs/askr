import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vite-plus/test';
import { cleanupApp, createSPA, hydrateSPA } from '../../../src/boot';
import {
  createDataRuntime,
  createQuery,
  defineQuery,
  getDefaultDataRuntime,
  prefetchQuery,
  type QueryPrefetchContext,
} from '../../../src/data';
import { navigate } from '../../../src/router/navigate';
import { createRouteRegistry, route } from '../../../src/router/route';
import { resource } from '../../../src/resources';
import { renderToString } from '../../../src/ssr';
import {
  createTestContainer,
  flushScheduler,
  waitForNextEvaluation,
} from '../../../test-utils/render/test-renderer';

async function settle(): Promise<void> {
  await waitForNextEvaluation();
  flushScheduler();
}

function defineUserQuery(key: string, value: string) {
  return defineQuery({
    key: () => key,
    fetch: vi.fn(async () => ({ name: value })),
  });
}

describe('app data runtime', () => {
  let container: HTMLElement;
  let cleanup: () => void;

  beforeEach(() => {
    ({ container, cleanup } = createTestContainer());
    getDefaultDataRuntime().queryData.clear();
    window.history.replaceState({}, '', '/');
  });

  afterEach(() => {
    cleanupApp(container);
    cleanup();
    getDefaultDataRuntime().queryData.clear();
    window.history.replaceState({}, '', '/');
  });

  it('should render hydrated query data from a custom runtime given hydrateSPA', async () => {
    const user = defineUserQuery('app-runtime:hydrated', 'client-1');
    const Page = () => {
      const query = createQuery(user, {});
      return <p>{query.data?.name ?? 'loading'}</p>;
    };
    const registry = () =>
      createRouteRegistry(() => {
        route('/', Page);
      });
    const serverRuntime = createDataRuntime();
    serverRuntime.queryData.set('app-runtime:hydrated', { name: 'ssr' });
    container.innerHTML = renderToString({
      url: '/',
      registry: registry(),
      dataRuntime: serverRuntime,
    });
    const dataRuntime = createDataRuntime();

    await hydrateSPA({ root: container, registry: registry(), dataRuntime });
    await settle();

    expect(container.textContent).toBe('ssr');
    expect(user.fetch).not.toHaveBeenCalled();
    expect(dataRuntime.queryCache.has('app-runtime:hydrated')).toBe(true);
    expect(getDefaultDataRuntime().queryCache.has('app-runtime:hydrated')).toBe(
      false
    );
  });

  it('should keep resource slots and query keys in separate hydration namespaces', async () => {
    // A query key that looks like a resource slot key.
    const user = defineUserQuery('r:0', 'client');
    const Page = () => {
      const slot = resource<string>(() => 'client-resource', []);
      const query = createQuery(user, {});
      return (
        <p>
          {String(slot.value)}|{query.data?.name ?? 'loading'}
        </p>
      );
    };
    const registry = () =>
      createRouteRegistry(() => {
        route('/', Page);
      });
    const serverRuntime = createDataRuntime();
    serverRuntime.queryData.set('r:0', { name: 'server-query' });
    container.innerHTML = renderToString({
      url: '/',
      registry: registry(),
      data: { 'r:0': 'server-resource' },
      dataRuntime: serverRuntime,
    });
    expect(container.querySelector('p')?.textContent).toBe(
      'server-resource|server-query'
    );
    const dataRuntime = createDataRuntime();

    await hydrateSPA({ root: container, registry: registry(), dataRuntime });
    await settle();

    expect(container.textContent).toBe('server-resource|server-query');
    expect(user.fetch).not.toHaveBeenCalled();
  });

  it('should not hydrate resource slots into the query data runtime', async () => {
    const Page = () => {
      const slot = resource<string>(() => 'client-resource', []);
      return <p>{String(slot.value)}</p>;
    };
    const registry = () =>
      createRouteRegistry(() => {
        route('/', Page);
      });
    container.innerHTML = renderToString({
      url: '/',
      registry: registry(),
      data: { 'r:0': 'server-resource' },
      dataRuntime: createDataRuntime(),
    });
    const dataRuntime = createDataRuntime();

    await hydrateSPA({ root: container, registry: registry(), dataRuntime });
    await settle();

    expect(container.textContent).toBe('server-resource');
    expect([...dataRuntime.queryData.keys()]).toEqual([]);
  });

  it('should preload the initial route into a custom runtime given createSPA', async () => {
    const user = defineUserQuery('app-runtime:initial', 'loaded');
    const Page = () => {
      const query = createQuery(user, {});
      return <p>{query.data?.name ?? 'loading'}</p>;
    };
    const registry = createRouteRegistry(() => {
      route('/', Page, {
        preload: ({ data }: { data: QueryPrefetchContext }) =>
          prefetchQuery(data, user, {}),
      });
    });
    const dataRuntime = createDataRuntime();

    await createSPA({ root: container, registry, dataRuntime });
    await settle();

    expect(container.textContent).toBe('loaded');
    expect(user.fetch).toHaveBeenCalledTimes(1);
    expect(dataRuntime.queryCache.has('app-runtime:initial')).toBe(true);
    expect(getDefaultDataRuntime().queryData.has('app-runtime:initial')).toBe(
      false
    );
  });

  it('should preload navigated routes into a custom runtime given createSPA', async () => {
    const user = defineUserQuery('app-runtime:navigated', 'loaded');
    const Home = () => <p>home</p>;
    const Page = () => {
      const query = createQuery(user, {});
      return <p>{query.data?.name ?? 'loading'}</p>;
    };
    const registry = createRouteRegistry(() => {
      route('/', Home);
      route('/user', Page, {
        preload: ({ data }: { data: QueryPrefetchContext }) =>
          prefetchQuery(data, user, {}),
      });
    });
    const dataRuntime = createDataRuntime();

    await createSPA({ root: container, registry, dataRuntime });
    navigate('/user');
    await settle();
    await settle();

    expect(container.textContent).toBe('loaded');
    expect(user.fetch).toHaveBeenCalledTimes(1);
    expect(dataRuntime.queryCache.has('app-runtime:navigated')).toBe(true);
    expect(getDefaultDataRuntime().queryData.has('app-runtime:navigated')).toBe(
      false
    );
  });

  it('should preload navigated routes into a custom runtime given hydrateSPA', async () => {
    const user = defineUserQuery('app-runtime:hydrated-nav', 'loaded');
    const Home = () => <p>home</p>;
    const Page = () => {
      const query = createQuery(user, {});
      return <p>{query.data?.name ?? 'loading'}</p>;
    };
    const registry = () =>
      createRouteRegistry(() => {
        route('/', Home);
        route('/user', Page, {
          preload: ({ data }: { data: QueryPrefetchContext }) =>
            prefetchQuery(data, user, {}),
        });
      });
    container.innerHTML = renderToString({ url: '/', registry: registry() });
    const dataRuntime = createDataRuntime();

    await hydrateSPA({ root: container, registry: registry(), dataRuntime });
    navigate('/user');
    await settle();
    await settle();

    expect(container.textContent).toBe('loaded');
    expect(user.fetch).toHaveBeenCalledTimes(1);
    expect(dataRuntime.queryCache.has('app-runtime:hydrated-nav')).toBe(true);
    expect(
      getDefaultDataRuntime().queryData.has('app-runtime:hydrated-nav')
    ).toBe(false);
  });
});
