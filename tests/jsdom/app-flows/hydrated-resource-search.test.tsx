import { routeRegistryFromTable } from '../../router-test-utils';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vite-plus/test';
import { cleanupApp, hydrateSPA } from '../../../src/boot';
import { For, Show } from '../../../src/control';
import { resource } from '../../../src/runtime/operations';
import { state } from '../../../src/runtime/state';
import { renderToString } from '../../../src/ssr';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';
import { createControlledDeferred, settleAsyncWork } from './helpers';

type SearchResult = {
  id: string;
  name: string;
};

describe('hydrated resource search app flow', () => {
  let container: HTMLElement;
  let cleanup: () => void;

  beforeEach(() => {
    ({ container, cleanup } = createTestContainer());
    window.history.replaceState({}, '', '/');
  });

  afterEach(() => {
    cleanupApp(container);
    cleanup();
    window.history.replaceState({}, '', '/');
  });

  it('should attach one search handler and start one resource request per hydrated input change', async () => {
    const requests = new Map<
      string,
      ReturnType<typeof createControlledDeferred<SearchResult[]>>
    >();
    const starts: string[] = [];

    function SearchPage() {
      const query = state('');
      const results = resource<SearchResult[]>(() => {
        const currentQuery = query();
        if (!currentQuery) {
          return [];
        }

        starts.push(currentQuery);
        const request = createControlledDeferred<SearchResult[]>();
        requests.set(currentQuery, request);
        return request.promise;
      }, [query()]);

      return (
        <main aria-label="Customer search">
          <label>
            Search customers
            <input
              aria-label="Search customers"
              value={query()}
              onInput={(event: Event) =>
                query.set((event.target as HTMLInputElement).value)
              }
            />
          </label>
          <p role="status">{query() ? 'Searching...' : 'Ready'}</p>
          <ul>
            <For each={results.value ?? []} by={(result) => result.id}>
              {(result) => <li>{result.name}</li>}
            </For>
          </ul>
        </main>
      );
    }

    const routes = [{ path: '/', handler: SearchPage }];
    container.innerHTML = renderToString({
      url: '/',
      registry: routeRegistryFromTable(routes),
      data: { 'r:0': [] },
    });

    const serverInput = container.querySelector(
      '[aria-label="Search customers"]'
    ) as HTMLInputElement;

    await hydrateSPA({
      root: container,
      registry: routeRegistryFromTable(routes),
    });

    serverInput.value = 'ada';
    serverInput.dispatchEvent(new Event('input', { bubbles: true }));
    flushScheduler();

    expect(container.querySelector('[aria-label="Search customers"]')).toBe(
      serverInput
    );
    expect(starts).toEqual(['ada']);
    expect(container.querySelector('[role="status"]')?.textContent).toBe(
      'Searching...'
    );

    requests.get('ada')!.resolve([{ id: 'customer-1', name: 'Ada Lovelace' }]);
    await settleAsyncWork();

    expect(container.querySelectorAll('li')).toHaveLength(1);
    expect(container.textContent).toContain('Ada Lovelace');

    serverInput.value = 'grace';
    serverInput.dispatchEvent(new Event('input', { bubbles: true }));
    flushScheduler();

    expect(starts).toEqual(['ada', 'grace']);

    requests
      .get('grace')!
      .resolve([{ id: 'customer-2', name: 'Grace Hopper' }]);
    await settleAsyncWork();

    expect(container.querySelectorAll('li')).toHaveLength(1);
    expect(container.textContent).toContain('Grace Hopper');
    expect(container.textContent).not.toContain('Ada Lovelace');
  });

  it('should recover from a failed hydrated search without duplicating retry work', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const requests = new Map<
      string,
      Array<ReturnType<typeof createControlledDeferred<SearchResult[]>>>
    >();
    const starts: string[] = [];

    function SearchPage() {
      const query = state('');
      const results = resource<SearchResult[]>(() => {
        const currentQuery = query();
        if (!currentQuery) {
          return [];
        }

        starts.push(currentQuery);
        const request = createControlledDeferred<SearchResult[]>();
        const requestsForQuery = requests.get(currentQuery) ?? [];
        requestsForQuery.push(request);
        requests.set(currentQuery, requestsForQuery);
        return request.promise;
      }, [query()]);

      return (
        <main aria-label="Customer search">
          <label>
            Search customers
            <input
              aria-label="Search customers"
              value={query()}
              onInput={(event: Event) =>
                query.set((event.target as HTMLInputElement).value)
              }
            />
          </label>
          <Show
            when={() => !!results.error}
            fallback={
              <Show
                when={() => results.pending}
                fallback={
                  <ul>
                    <For each={results.value ?? []} by={(result) => result.id}>
                      {(result) => <li>{result.name}</li>}
                    </For>
                  </ul>
                }
              >
                <p role="status">Searching...</p>
              </Show>
            }
          >
            <div role="alert">
              <span>{results.error?.message}</span>
              <button type="button" onClick={() => results.refresh()}>
                Retry
              </button>
            </div>
          </Show>
        </main>
      );
    }

    try {
      const routes = [{ path: '/', handler: SearchPage }];
      container.innerHTML = renderToString({
        url: '/',
        registry: routeRegistryFromTable(routes),
        data: { 'r:0': [] },
      });

      const serverInput = container.querySelector(
        '[aria-label="Search customers"]'
      ) as HTMLInputElement;

      await hydrateSPA({
        root: container,
        registry: routeRegistryFromTable(routes),
      });

      serverInput.value = 'ada';
      serverInput.dispatchEvent(new Event('input', { bubbles: true }));
      flushScheduler();

      expect(starts).toEqual(['ada']);

      requests.get('ada')![0]!.reject(new Error('Customer lookup failed'));
      await settleAsyncWork();

      const staleRetry = container.querySelector(
        '[role="alert"] button'
      ) as HTMLButtonElement;
      expect(container.querySelector('[role="alert"]')?.textContent).toContain(
        'Customer lookup failed'
      );

      staleRetry.click();
      flushScheduler();

      expect(starts).toEqual(['ada', 'ada']);
      expect(container.querySelector('[role="alert"]')).toBeNull();

      staleRetry.click();
      flushScheduler();

      expect(starts).toEqual(['ada', 'ada']);

      requests
        .get('ada')![1]!
        .resolve([{ id: 'customer-2', name: 'Grace Hopper' }]);
      await settleAsyncWork();

      expect(container.querySelectorAll('li')).toHaveLength(1);
      expect(container.textContent).toContain('Grace Hopper');
      expect(container.textContent).not.toContain('Customer lookup failed');
    } finally {
      errorSpy.mockRestore();
    }
  });

  it('should reuse preloaded SSR resource data during hydration before starting new searches', async () => {
    const requests = new Map<
      string,
      ReturnType<typeof createControlledDeferred<SearchResult[]>>
    >();
    const starts: string[] = [];

    function SearchPage() {
      const query = state('ada');
      const results = resource<SearchResult[]>(() => {
        const currentQuery = query();
        starts.push(currentQuery);
        const request = createControlledDeferred<SearchResult[]>();
        requests.set(currentQuery, request);
        return request.promise;
      }, [query()]);

      return (
        <main aria-label="Customer search">
          <label>
            Search customers
            <input
              aria-label="Search customers"
              value={query()}
              onInput={(event: Event) =>
                query.set((event.target as HTMLInputElement).value)
              }
            />
          </label>
          <p role="status">{results.pending ? 'Searching...' : 'Ready'}</p>
          <ul>
            <For each={results.value ?? []} by={(result) => result.id}>
              {(result) => <li>{result.name}</li>}
            </For>
          </ul>
        </main>
      );
    }

    const routes = [{ path: '/', handler: SearchPage }];
    container.innerHTML = renderToString({
      url: '/',
      registry: routeRegistryFromTable(routes),
      data: {
        'r:0': [{ id: 'customer-1', name: 'Ada Lovelace' }],
      },
    });

    expect(container.textContent).toContain('Ada Lovelace');

    const serverInput = container.querySelector(
      '[aria-label="Search customers"]'
    ) as HTMLInputElement;

    await hydrateSPA({
      root: container,
      registry: routeRegistryFromTable(routes),
    });

    expect(container.querySelector('[aria-label="Search customers"]')).toBe(
      serverInput
    );
    expect(starts).toEqual([]);
    expect(container.querySelector('[role="status"]')?.textContent).toBe(
      'Ready'
    );
    expect(container.textContent).toContain('Ada Lovelace');

    serverInput.value = 'grace';
    serverInput.dispatchEvent(new Event('input', { bubbles: true }));
    flushScheduler();

    expect(starts).toEqual(['grace']);

    requests
      .get('grace')!
      .resolve([{ id: 'customer-2', name: 'Grace Hopper' }]);
    await settleAsyncWork();

    expect(container.textContent).toContain('Grace Hopper');
    expect(container.textContent).not.toContain('Ada Lovelace');
  });

  it.each([
    {
      label: 'a direct snapshot conditional',
      renderResult: (results: ReturnType<typeof resource<string>>) =>
        results.value ? (
          <p role="status">{results.value}</p>
        ) : (
          <p role="status">Loading...</p>
        ),
    },
    {
      label: 'Show',
      renderResult: (results: ReturnType<typeof resource<string>>) => (
        <Show
          when={() => results.value}
          fallback={<p role="status">Loading...</p>}
        >
          {(value) => <p role="status">{value}</p>}
        </Show>
      ),
    },
  ])(
    'should start a browser-only resource after verified SSG hydration through $label',
    async ({ renderResult }) => {
      const request = createControlledDeferred<string>();
      const starts: string[] = [];
      let clientRender = false;
      const errors: unknown[][] = [];
      const errorSpy = vi
        .spyOn(console, 'error')
        .mockImplementation((...args) => errors.push(args));

      function SearchPage() {
        const browserReady = clientRender && typeof window !== 'undefined';
        const results = resource(() => {
          if (!clientRender || typeof window === 'undefined') return null;
          starts.push('browser');
          return request.promise;
        }, [browserReady]);

        return renderResult(results as ReturnType<typeof resource<string>>);
      }

      try {
        const routes = [{ path: '/', handler: SearchPage }];
        const registry = routeRegistryFromTable(routes);
        container.innerHTML = renderToString({ url: '/', registry });
        clientRender = true;

        await hydrateSPA({
          root: container,
          registry,
          hydrate: { verifyMarkup: true },
        });
        await settleAsyncWork();

        expect(starts).toEqual(['browser']);
        expect(container.querySelector('[role="status"]')?.textContent).toBe(
          'Loading...'
        );

        request.resolve('Search ready');
        await settleAsyncWork();

        expect(container.querySelector('[role="status"]')?.textContent).toBe(
          'Search ready'
        );
        expect(starts).toEqual(['browser']);
        expect(errors).toEqual([]);
      } finally {
        errorSpy.mockRestore();
      }
    }
  );

  it('should continue verifying synchronous resource output', async () => {
    const starts: string[] = [];

    function StatusPage() {
      const status = resource(() => {
        starts.push('sync');
        return 'Ready';
      });
      return <p role="status">{status.value}</p>;
    }

    const registry = routeRegistryFromTable([
      { path: '/', handler: StatusPage },
    ]);
    container.innerHTML = renderToString({ url: '/', registry });

    await hydrateSPA({
      root: container,
      registry,
      hydrate: { verifyMarkup: true },
    });
    await settleAsyncWork();

    expect(container.querySelector('[role="status"]')?.textContent).toBe(
      'Ready'
    );
    expect(starts).toEqual(['sync', 'sync', 'sync']);
  });
});
