/** @jsxImportSource @askrjs/askr */

import { For } from '@askrjs/askr/control';
import { resource } from '@askrjs/askr/resources';
import { currentRoute, updateRouteQuery } from '@askrjs/askr/router';

type Customer = {
  id: string;
  name: string;
  city: string;
  status: 'Active' | 'Prospect';
};

type CustomerSearchResponse = {
  customers: Customer[];
};

function SearchBox({ query }: { query: string }) {
  const updateQuery = (event: Event) => {
    const input = event.currentTarget as HTMLInputElement;
    const value = input.value.trim();
    updateRouteQuery({ q: value || null });
  };

  const clearSearch = () => {
    updateRouteQuery({ q: null });
  };

  return (
    <form
      aria-label="Customer search"
      role="search"
      onSubmit={(event: Event) => event.preventDefault()}
    >
      <label>
        Search customers
        <input
          type="search"
          value={query}
          onInput={updateQuery}
          autocomplete="off"
        />
      </label>
      {query ? (
        <button type="button" onClick={clearSearch}>
          Clear search
        </button>
      ) : null}
    </form>
  );
}

function CustomerResults({ query }: { query: string }) {
  const results = resource(
    async ({ signal }) => {
      const response = await fetch(
        `/api/customers/search?q=${encodeURIComponent(query)}`,
        { signal }
      );

      if (!response.ok) {
        throw new Error('Customer search failed');
      }

      return (await response.json()) as CustomerSearchResponse;
    },
    [query]
  );

  const customers =
    results.pending || results.error ? [] : (results.value?.customers ?? []);
  const showEmptyState =
    !results.pending && !results.error && customers.length === 0;

  return (
    <section aria-label="Customer results">
      {results.error ? <p role="alert">Customer search failed.</p> : null}
      {results.error ? (
        <button type="button" onClick={() => results.refresh()}>
          Retry search
        </button>
      ) : null}
      {!results.error && (results.pending || !results.value) ? (
        <p role="status">Searching customers...</p>
      ) : null}
      {showEmptyState ? <p>No customers found.</p> : null}
      <ul hidden={results.pending || !!results.error || customers.length === 0}>
        <For each={customers} by={(customer) => customer.id}>
          {(customer) => (
            <li>
              <h3>{customer.name}</h3>
              <p>
                {customer.city} - {customer.status}
              </p>
            </li>
          )}
        </For>
      </ul>
    </section>
  );
}

export function CustomerSearchPage() {
  const route = currentRoute();
  const query = route.query.get('q') ?? '';

  return (
    <section aria-label="Customers">
      <h2>Customers</h2>
      <p>Find customers by company name, city, or account status.</p>
      <SearchBox query={query} />
      <CustomerResults query={query} />
    </section>
  );
}
