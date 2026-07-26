/** @jsxImportSource @askrjs/askr */

import { state } from '@askrjs/askr';
import { For } from '@askrjs/askr/control';
import { on, resource } from '@askrjs/askr/resources';
import {
  createRouteRegistry,
  currentRoute,
  route,
  updateRouteQuery,
} from '@askrjs/askr/router';

export type SearchResult = {
  id: string;
  label: string;
};

export type SearchLoader = (
  query: string,
  signal: AbortSignal
) => Promise<SearchResult[]>;

export function createSearchRenderData(
  results: SearchResult[] = []
): Record<string, unknown> {
  return { 'r:0': results };
}

async function loadSearchResults(
  query: string,
  signal: AbortSignal
): Promise<SearchResult[]> {
  const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`, {
    signal,
  });
  if (!response.ok) {
    throw new Error('Search failed');
  }
  return (await response.json()) as SearchResult[];
}

function SearchPage({ load = loadSearchResults }: { load?: SearchLoader }) {
  const paletteOpen = state(false);
  const activeRoute = currentRoute();
  const query = activeRoute.query.get('q') ?? '';
  const results = resource(({ signal }) => load(query, signal), [query]);

  on(
    () => window,
    'keydown',
    (event) => {
      const keyboardEvent = event as KeyboardEvent;
      if (
        (keyboardEvent.ctrlKey || keyboardEvent.metaKey) &&
        keyboardEvent.key.toLowerCase() === 'k'
      ) {
        keyboardEvent.preventDefault();
        paletteOpen.set(true);
      }
    }
  );

  const resultRows = (
    <For each={results.value ?? []} by={(result) => result.id}>
      {(result) => <li>{result.label}</li>}
    </For>
  );

  return (
    <section aria-label="Search recipe">
      <form
        role="search"
        aria-label="Site search"
        onSubmit={(event) => event.preventDefault()}
      >
        <label>
          Search
          <input
            type="search"
            value={query}
            onInput={(event) => {
              const input = event.currentTarget as HTMLInputElement;
              const nextQuery = input.value.trim();
              updateRouteQuery({ q: nextQuery || null });
            }}
          />
        </label>
      </form>

      {paletteOpen() ? (
        <section role="dialog" aria-label="Command palette">
          <button type="button" onClick={() => paletteOpen.set(false)}>
            Close commands
          </button>
        </section>
      ) : null}

      {results.error ? (
        <section role="alert">
          <p>Search is unavailable.</p>
          <button type="button" onClick={() => void results.refresh()}>
            Retry search
          </button>
        </section>
      ) : results.pending || !results.value ? (
        <p role="status">Searching...</p>
      ) : results.value.length === 0 ? (
        <p>No results found.</p>
      ) : (
        <ul>{resultRows}</ul>
      )}
    </section>
  );
}

export function createSearchRegistry(load?: SearchLoader) {
  return createRouteRegistry(() => {
    route('/search', () => <SearchPage load={load} />);
  });
}
