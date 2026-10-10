import { afterEach, beforeEach, expect, it, vi } from 'vite-plus/test';
import { state } from '../../../src';
import {
  cleanupApp,
  createIsland,
  createSPA,
  hydrateSPA,
  replaceDataRuntime,
} from '../../../src/boot';
import {
  createDataRuntime,
  createMutation,
  createQuery,
  createQueryCollection,
  defineQuery,
  disposeDataRuntime,
  getDefaultDataRuntime,
  prefetchQuery,
  type Mutation,
  type Query,
  type QueryCollection,
} from '../../../src/data';
import { getAppRoot } from '../../../src/boot/root-lifecycle';
import { navigate } from '../../../src/router/navigate';
import { createRouteRegistry, route } from '../../../src/router/route';
import { resetRouterState } from '../../../src/router/reset';
import { redirect } from '../../../src/router/policy';
import { currentAuth } from '../../../src/router/auth';
import { renderToString } from '../../../src/ssr';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';

async function settle(): Promise<void> {
  for (let index = 0; index < 16; index++) {
    await Promise.resolve();
    flushScheduler();
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

let view: ReturnType<typeof createTestContainer>;
beforeEach(() => {
  resetRouterState();
  view = createTestContainer();
  window.history.replaceState({}, '', '/');
});
afterEach(() => {
  cleanupApp(view.container);
  view.cleanup();
  resetRouterState();
  window.history.replaceState({}, '', '/');
  document.head
    .querySelectorAll('[data-askr-head]')
    .forEach((node) => node.remove());
  vi.restoreAllMocks();
  Reflect.deleteProperty(globalThis, Symbol.for('__ASKR_EXECUTION_MODEL__'));
});

it('should switch implicit queries, mutations and collections while preserving shell state and nodes', async () => {
  const old = createDataRuntime();
  const next = createDataRuntime();
  old.queryData.set('identity', 'old');
  next.queryData.set('identity', 'next');
  old.queryData.set('row:1', 'old row');
  next.queryData.set('row:1', 'next row');
  const pending = deferred<string>();
  const identity = defineQuery({
    key: () => 'identity',
    fetch: () => pending.promise,
  });
  let query!: Query<string>;
  let mutation!: Mutation<void, string>;
  let collection!: QueryCollection<number, string, number>;
  const row = defineQuery({
    key: (id: number) => `row:${id}`,
    fetch: async () => 'fetched',
  });
  const Child = () => {
    query = createQuery(identity, {});
    mutation = createMutation({ key: 'save', action: async () => 'saved' });
    collection = createQueryCollection({
      query: row,
      inputs: () => [1],
      key: (id) => id,
    });
    return (
      <output>
        {query.data}:{collection.get(1)?.query.data}
      </output>
    );
  };
  const Page = () => {
    const count = state(0);
    return (
      <main>
        <button onClick={() => count.set(count() + 1)}>{count()}</button>
        <Child />
      </main>
    );
  };
  const registry = createRouteRegistry(() => route('/', Page));
  await createSPA({ root: view.container, registry, dataRuntime: old });
  await settle();
  const button = view.container.querySelector('button')!;
  const output = view.container.querySelector('output')!;
  button.click();
  flushScheduler();
  const oldQuery = query;
  const oldMutation = mutation;
  const oldCollection = collection;
  const refresh = oldQuery.refresh();
  replaceDataRuntime(view.container, next);
  await settle();
  expect(view.container.querySelector('button')).toBe(button);
  expect(view.container.querySelector('output')).toBe(output);
  expect(button.textContent).toBe('1');
  expect(output.textContent).toBe('next:next row');
  expect(query).not.toBe(oldQuery);
  expect(mutation).not.toBe(oldMutation);
  expect(collection).not.toBe(oldCollection);
  expect(oldCollection.entries).toHaveLength(0);
  expect(oldQuery.error).toBeNull(); // replacement does not retire a shared runtime
  disposeDataRuntime(old);
  expect(oldQuery.data).toBeNull();
  await expect(oldMutation.execute()).rejects.toMatchObject({
    name: 'AbortError',
  });
  pending.resolve('late old identity');
  await refresh;
  await settle();
  expect(output.textContent).toBe('next:next row');
  expect(await mutation.execute()).toBe('saved');
  expect(getDefaultDataRuntime().queryCache.has('identity')).toBe(false);
  disposeDataRuntime(next);
});

it('should keep explicitly owned query, mutation and collection hooks on their supplied runtime', async () => {
  const old = createDataRuntime();
  const next = createDataRuntime();
  const explicit = createDataRuntime();
  explicit.queryData.set('explicit-query', 'explicit');
  explicit.queryData.set('explicit-row:1', 'explicit row');
  const definition = defineQuery({
    key: () => 'explicit-query',
    fetch: async () => 'fetched',
  });
  const row = defineQuery({
    key: (id: number) => `explicit-row:${id}`,
    fetch: async () => 'fetched row',
  });
  let query!: Query<string>;
  let mutation!: Mutation<void, string>;
  let collection!: QueryCollection<number, string, number>;
  createIsland({
    root: view.container,
    dataRuntime: old,
    component: () => {
      query = createQuery(definition, {}, { runtime: explicit });
      mutation = createMutation({
        runtime: explicit,
        key: 'explicit-save',
        action: async () => 'explicit saved',
      });
      collection = createQueryCollection({
        runtime: explicit,
        query: row,
        inputs: () => [1],
        key: (id) => id,
      });
      return (
        <p>
          {query.data}:{collection.get(1)?.query.data}
        </p>
      );
    },
  });
  const retained = { query, mutation, collection };
  const node = view.container.firstChild;
  replaceDataRuntime(view.container, next);
  expect(query).toBe(retained.query);
  expect(mutation).toBe(retained.mutation);
  expect(collection).toBe(retained.collection);
  expect(collection.entries).toHaveLength(1);
  expect(view.container.firstChild).toBe(node);
  expect(view.container.textContent).toBe('explicit:explicit row');
  disposeDataRuntime(old);
  disposeDataRuntime(next);
  expect(await mutation.execute()).toBe('explicit saved');
  expect(query.error).toBeNull();
  expect(explicit.queryCache.has('explicit-query')).toBe(true);
  expect(next.queryCache.size).toBe(0);
  disposeDataRuntime(explicit);
});

it.each(['loader', 'preload', 'metadata'] as const)(
  'should discard a pending old %s without rendering, metadata or history side effects',
  async (stage) => {
    const old = createDataRuntime();
    const next = createDataRuntime();
    const pending = deferred<string>();
    const metadata = vi.fn(() => ({ title: 'Obsolete' }));
    const destination = vi.fn(() => <p>obsolete</p>);
    const registry = createRouteRegistry(() => {
      route('/', () => <p>home</p>, { meta: { title: 'Home' } });
      route('/pending', destination, {
        loader: stage === 'loader' ? () => pending.promise : undefined,
        preload:
          stage === 'preload'
            ? () => pending.promise.then(() => undefined)
            : undefined,
        meta:
          stage === 'metadata'
            ? () => pending.promise.then(() => ({ title: 'Obsolete' }))
            : metadata,
      });
    });
    await createSPA({ root: view.container, registry, dataRuntime: old });
    navigate('/pending');
    await settle();
    replaceDataRuntime(view.container, next);
    // Returning to A must not revive a navigation started under A's earlier owner.
    replaceDataRuntime(view.container, old);
    pending.resolve('old route data');
    await settle();
    expect(view.container.textContent).toBe('home');
    expect(destination).not.toHaveBeenCalled();
    if (stage !== 'metadata') expect(metadata).not.toHaveBeenCalled();
    expect(document.title).toBe('Home');
    expect(location.pathname).toBe('/');
    disposeDataRuntime(old);
    disposeDataRuntime(next);
  }
);

it('should stop obsolete auth before publishing its identity or invoking its loader', async () => {
  const old = createDataRuntime();
  const next = createDataRuntime();
  const initial = {
    authenticated: true,
    principal: { id: 'initial' },
    session: null,
    tenant: null,
  };
  const pending = deferred<typeof initial>();
  const loader = vi.fn(() => 'obsolete');
  const registry = createRouteRegistry(() => {
    route('/', () => <p>home</p>);
    route('/pending', () => <p>obsolete</p>, { loader });
  });
  await createSPA({
    root: view.container,
    registry,
    dataRuntime: old,
    auth: {
      resolve: ({ pathname }) => (pathname === '/' ? initial : pending.promise),
    },
  });
  expect(currentAuth()).toBe(initial);
  navigate('/pending');
  replaceDataRuntime(view.container, next);
  pending.resolve({ ...initial, principal: { id: 'obsolete' } });
  await settle();
  expect(currentAuth()).toBe(initial);
  expect(loader).not.toHaveBeenCalled();
  expect(view.container.textContent).toBe('home');
  expect(location.pathname).toBe('/');
  disposeDataRuntime(old);
  disposeDataRuntime(next);
});

it.each(['policy', 'preload'] as const)(
  'should not start an old loader after its pending %s settles',
  async (stage) => {
    const old = createDataRuntime();
    const next = createDataRuntime();
    const pending = deferred<void>();
    const loader = vi.fn(() => 'obsolete');
    const registry = createRouteRegistry(() => {
      route('/', () => <p>home</p>);
      route('/pending', () => <p>obsolete</p>, {
        loader,
        policies:
          stage === 'policy'
            ? [() => pending.promise.then(() => ({ kind: 'allow' as const }))]
            : undefined,
        preload: stage === 'preload' ? () => pending.promise : undefined,
      });
    });
    await createSPA({ root: view.container, registry, dataRuntime: old });
    navigate('/pending');
    replaceDataRuntime(view.container, next);
    pending.resolve();
    await settle();
    expect(loader).not.toHaveBeenCalled();
    expect(view.container.textContent).toBe('home');
    expect(location.pathname).toBe('/');
    disposeDataRuntime(old);
    disposeDataRuntime(next);
  }
);

it('should preload future navigation into the replacement runtime and keep another root isolated', async () => {
  const old = createDataRuntime();
  const next = createDataRuntime();
  const other = createDataRuntime();
  const sibling = createTestContainer();
  const definition = defineQuery({
    key: () => 'navigation-owner',
    fetch: async () => 'next route',
  });
  const registry = createRouteRegistry(() => {
    route('/', () => <p>home</p>);
    route(
      '/next',
      () => {
        const query = createQuery(definition, {});
        return <p>{query.data}</p>;
      },
      { preload: ({ data }) => prefetchQuery(data, definition, {}) }
    );
  });
  other.queryData.set('navigation-owner', 'independent');
  let siblingQuery!: Query<string>;
  try {
    const siblingRegistry = createRouteRegistry(() =>
      route('/', () => {
        siblingQuery = createQuery(definition, {});
        return <p>{siblingQuery.data}</p>;
      })
    );
    await createSPA({
      root: sibling.container,
      dataRuntime: other,
      registry: siblingRegistry,
    });
    await createSPA({ root: view.container, registry, dataRuntime: old });
    replaceDataRuntime(view.container, next);
    disposeDataRuntime(old);
    navigate('/next');
    await settle();
    expect(view.container.textContent).toBe('next route');
    expect(next.queryCache.has('navigation-owner')).toBe(true);
    expect(old.queryCache.size).toBe(0);
    expect(sibling.container.textContent).toBe('independent');
    expect(siblingQuery.error).toBeNull();
  } finally {
    cleanupApp(sibling.container);
    sibling.cleanup();
    disposeDataRuntime(next);
    disposeDataRuntime(other);
  }
});

it('should preserve hydrated node identity, route/framework data and island state', async () => {
  const old = createDataRuntime();
  const next = createDataRuntime();
  const Page = () => {
    const count = state(0);
    return <button onClick={() => count.set(count() + 1)}>{count()}</button>;
  };
  const registry = createRouteRegistry(() => route('/', Page));
  view.container.innerHTML = renderToString({ url: '/', registry });
  const button = view.container.querySelector('button')!;
  await hydrateSPA({ root: view.container, registry, dataRuntime: old });
  button.click();
  flushScheduler();
  const previous = getAppRoot(view.container)!.appRuntime!;
  replaceDataRuntime(view.container, next);
  const current = getAppRoot(view.container)!.appRuntime!;
  expect(view.container.querySelector('button')).toBe(button);
  expect(button.textContent).toBe('1');
  expect(current.hydrationResources).toBe(previous.hydrationResources);
  expect(current.framework).toBe(previous.framework);
  expect(current.route).toBe(previous.route);
  expect(current.routeRegistry).toBe(previous.routeRegistry);
  expect(current.routeAuth).toBe(previous.routeAuth);
  expect(current.lifetime).toBe(previous.lifetime);
  cleanupApp(view.container);
  Reflect.deleteProperty(globalThis, Symbol.for('__ASKR_EXECUTION_MODEL__'));
  createIsland({ root: view.container, component: Page, dataRuntime: old });
  const islandButton = view.container.querySelector('button')!;
  islandButton.click();
  flushScheduler();
  replaceDataRuntime(view.container, next);
  expect(view.container.querySelector('button')).toBe(islandButton);
  expect(islandButton.textContent).toBe('1');
  disposeDataRuntime(old);
  disposeDataRuntime(next);
});

it('should reject invalid owners before changing the app and treat a live same-runtime replacement as a no-op', () => {
  const old = createDataRuntime();
  const retired = createDataRuntime();
  disposeDataRuntime(retired);
  view.container.id = 'replace-owner';
  createIsland({
    root: view.container,
    dataRuntime: old,
    component: () => <p>unchanged</p>,
  });
  const previous = getAppRoot(view.container)!.appRuntime;
  replaceDataRuntime('#replace-owner', old);
  expect(getAppRoot(view.container)!.appRuntime).toBe(previous);
  expect(() => replaceDataRuntime('missing-owner', old)).toThrow(/mounted/);
  expect(() => replaceDataRuntime(document.createElement('div'), old)).toThrow(
    /mounted/
  );
  expect(() => replaceDataRuntime(view.container, {} as never)).toThrow(
    /createDataRuntime/
  );
  expect(() => replaceDataRuntime(view.container, undefined as never)).toThrow(
    /createDataRuntime/
  );
  expect(() => replaceDataRuntime(view.container, retired)).toThrow(/disposed/);
  expect(getAppRoot(view.container)!.appRuntime).toBe(previous);
  expect(view.container.textContent).toBe('unchanged');
  disposeDataRuntime(old);
  expect(() => replaceDataRuntime(view.container, old)).toThrow(/disposed/);
});

it.each(['render', 'write'] as const)(
  'should roll back a failed %s and allow a pending old navigation to settle',
  async (failure) => {
    const old = createDataRuntime();
    const next = createDataRuntime();
    old.queryData.set('rollback-owner', 'old');
    next.queryData.set('rollback-owner', 'next');
    const pending = deferred<string>();
    const definition = defineQuery({
      key: () => 'rollback-owner',
      fetch: () => new Promise<string>(() => {}),
    });
    let reject = false;
    const registry = createRouteRegistry(() => {
      route('/', () => {
        const query = createQuery(definition, {});
        if (reject && failure === 'render' && query.data === 'next') {
          pending.resolve('settled during failed replacement');
          throw new Error('replacement render failed');
        }
        return <p>{query.data}</p>;
      });
      route('/pending', () => <p>old navigation</p>, {
        loader: () => pending.promise,
      });
    });
    await createSPA({ root: view.container, registry, dataRuntime: old });
    const node = view.container.querySelector('p')!;
    const previous = getAppRoot(view.container)!.appRuntime;
    navigate('/pending');
    reject = true;
    const text = node.firstChild as Text;
    if (failure === 'write') {
      const descriptor = Object.getOwnPropertyDescriptor(
        CharacterData.prototype,
        'data'
      )!;
      Object.defineProperty(text, 'data', {
        configurable: true,
        get() {
          return descriptor.get!.call(this);
        },
        set(value) {
          if (value === 'next') throw new Error('replacement write failed');
          descriptor.set!.call(this, value);
        },
      });
    }
    expect(() => replaceDataRuntime(view.container, next)).toThrow(
      /replacement (render|write) failed/
    );
    expect(getAppRoot(view.container)!.appRuntime).toBe(previous);
    expect(view.container.querySelector('p')).toBe(node);
    expect(node.textContent).toBe('old');
    expect(() =>
      createQuery({
        runtime: next,
        key: 'still-live',
        fetch: async () => 'live',
      })
    ).not.toThrow();
    pending.resolve('ready');
    await settle();
    expect(view.container.textContent).toBe('old navigation');
    expect(location.pathname).toBe('/pending');
    disposeDataRuntime(old);
    disposeDataRuntime(next);
  }
);

it('should restore retained collection ownership when a replacement render fails after its hooks', async () => {
  const old = createDataRuntime();
  const next = createDataRuntime();
  old.queryData.set('rollback-row:1', 'old row');
  next.queryData.set('rollback-row:1', 'next row');
  const definition = defineQuery({
    key: (id: number) => `rollback-row:${id}`,
    fetch: async () => 'fetched',
  });
  let collection!: QueryCollection<number, string, number>;
  let fail = false;
  const registry = createRouteRegistry(() =>
    route('/', () => {
      collection = createQueryCollection({
        query: definition,
        inputs: () => [1],
        key: (id) => id,
      });
      if (fail) throw new Error('after collection');
      return <p>{collection.get(1)?.query.data}</p>;
    })
  );
  await createSPA({ root: view.container, registry, dataRuntime: old });
  const retained = collection;
  fail = true;
  expect(() => replaceDataRuntime(view.container, next)).toThrow(
    'after collection'
  );
  expect(view.container.textContent).toBe('old row');
  expect(retained.entries).toHaveLength(1);
  expect(retained.get(1)?.query.data).toBe('old row');
  fail = false;
  replaceDataRuntime(view.container, next);
  await settle();
  expect(view.container.textContent).toBe('fetched');
  disposeDataRuntime(old);
  disposeDataRuntime(next);
});

it('should retain a pending navigation on a same-runtime no-op but reject an old-owner redirect', async () => {
  const old = createDataRuntime();
  const next = createDataRuntime();
  const pending = deferred<string>();
  const decision = deferred<ReturnType<typeof redirect>>();
  const registry = createRouteRegistry(() => {
    route('/', () => <p>home</p>);
    route('/pending', () => <p>same owner</p>, {
      loader: () => pending.promise,
    });
    route('/redirect', () => <p>never rendered</p>, {
      policies: [() => decision.promise],
    });
    route('/obsolete', () => <p>wrong identity</p>);
  });
  await createSPA({ root: view.container, registry, dataRuntime: old });
  navigate('/pending');
  replaceDataRuntime(view.container, old);
  pending.resolve('ready');
  await settle();
  expect(view.container.textContent).toBe('same owner');
  expect(location.pathname).toBe('/pending');
  navigate('/redirect');
  await settle();
  replaceDataRuntime(view.container, next);
  decision.resolve(redirect('/obsolete'));
  await settle();
  expect(view.container.textContent).toBe('same owner');
  expect(location.pathname).toBe('/pending');
  disposeDataRuntime(old);
  disposeDataRuntime(next);
});

it('should keep the committed replacement when a post-commit ref fails', async () => {
  const old = createDataRuntime();
  const next = createDataRuntime();
  old.queryData.set('ref-owner', 'old');
  next.queryData.set('ref-owner', 'next');
  const definition = defineQuery({
    key: () => 'ref-owner',
    fetch: () => new Promise<string>(() => {}),
  });
  const failure = new Error('replacement ref failed');
  const registry = createRouteRegistry(() =>
    route('/', () => {
      const query = createQuery(definition, {});
      const value = query.data;
      return (
        <p
          ref={(node) => {
            if (node && value === 'next') throw failure;
          }}
        >
          {value}
        </p>
      );
    })
  );
  await createSPA({ root: view.container, registry, dataRuntime: old });
  const node = view.container.querySelector('p');
  expect(() => replaceDataRuntime(view.container, next)).toThrow(failure);
  expect(getAppRoot(view.container)!.appRuntime?.dataRuntime).toBe(next);
  expect(view.container.querySelector('p')).toBe(node);
  expect(view.container.textContent).toBe('next');
  expect(() =>
    createQuery({
      runtime: old,
      key: 'old-not-disposed',
      fetch: async () => 'live',
    })
  ).not.toThrow();
  disposeDataRuntime(old);
  disposeDataRuntime(next);
});

it("should preserve another basePath app's pending navigation when this root is unmatched", async () => {
  const old = createDataRuntime();
  const next = createDataRuntime();
  const other = createDataRuntime();
  const sibling = createTestContainer();
  const pending = deferred<string>();
  let started = false;
  try {
    history.replaceState({}, '', '/a/home');
    await createSPA({
      root: view.container,
      dataRuntime: old,
      registry: createRouteRegistry(() => route('/home', () => <p>A home</p>), {
        basePath: '/a',
      }),
    });
    history.replaceState({}, '', '/b/home');
    await createSPA({
      root: sibling.container,
      dataRuntime: other,
      registry: createRouteRegistry(
        () => {
          route('/home', () => <p>B home</p>);
          route('/pending', () => <p>B ready</p>, {
            loader: () => {
              started = true;
              return pending.promise;
            },
          });
        },
        { basePath: '/b' }
      ),
    });
    navigate('/pending');
    expect(started).toBe(true);
    replaceDataRuntime(view.container, next);
    pending.resolve('B data');
    await settle();
    expect(sibling.container.textContent).toBe('B ready');
    expect(view.container.textContent).toBe('A home');
    expect(location.pathname).toBe('/b/pending');
  } finally {
    cleanupApp(sibling.container);
    sibling.cleanup();
    disposeDataRuntime(old);
    disposeDataRuntime(next);
    disposeDataRuntime(other);
  }
});
