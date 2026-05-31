import { afterEach, beforeEach, describe, expect, it } from 'vite-plus/test';
import { cleanupApp, hydrateSPA } from '../../../src/boot';
import { For } from '../../../src/control';
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
      routes,
      data: { 'r:0': [] },
    });

    const serverInput = container.querySelector(
      '[aria-label="Search customers"]'
    ) as HTMLInputElement;

    await hydrateSPA({ root: container, routes });

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
});
