import { expect, test } from 'vite-plus/test';
import { page } from 'vite-plus/test/browser/context';
import {
  loadBrowserHarness,
  setBrowserLocation,
  mockJsonFetch,
} from './_helpers';

type Customer = {
  id: string;
  name: string;
  city: string;
  status: 'Active' | 'Prospect';
};

type SearchFixture = {
  customers: Customer[];
  delayMs?: number;
  status?: number;
};

const featuredCustomers: Customer[] = [
  {
    id: 'featured-1',
    name: 'Featured Customer',
    city: 'Portland',
    status: 'Active',
  },
];

const customerFixtures: Record<string, SearchFixture> = {
  '': { customers: featuredCustomers },
  northwind: {
    customers: [
      {
        id: 'northwind',
        name: 'Northwind Traders',
        city: 'Seattle',
        status: 'Active',
      },
    ],
  },
  acme: {
    customers: [
      {
        id: 'acme',
        name: 'Acme Corp',
        city: 'Austin',
        status: 'Prospect',
      },
    ],
  },
};

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function respondSearch(
  fixture: SearchFixture,
  options: { delayMs?: number; release?: Promise<void> } = {}
): Promise<Response> {
  if (fixture.delayMs || options.delayMs) {
    await wait(fixture.delayMs ?? options.delayMs ?? 0);
  }

  if (options.release) {
    await options.release;
  }

  return new Response(JSON.stringify({ customers: fixture.customers }), {
    status: fixture.status ?? 200,
    headers: { 'content-type': 'application/json' },
  });
}

function installCustomerSearchMock(
  overrides: Record<string, SearchFixture> = {},
  onQuery?: (query: string) => void
): void {
  mockJsonFetch(async (input: RequestInfo | URL) => {
    const requestUrl = new URL(
      input instanceof Request ? input.url : input.toString(),
      window.location.origin
    );
    const query = requestUrl.searchParams.get('q') ?? '';
    onQuery?.(query);

    return respondSearch({
      ...customerFixtures[query],
      ...overrides[query],
    });
  });
}

test.describe('customer search with route-driven resources', () => {
  test('should render an empty search and load featured customers', async () => {
    let releaseFeaturedSearch!: () => void;
    const featuredSearchReleased = new Promise<void>((resolve) => {
      releaseFeaturedSearch = resolve;
    });

    mockJsonFetch(async (input: RequestInfo | URL) => {
      const requestUrl = new URL(
        input instanceof Request ? input.url : input.toString(),
        window.location.origin
      );
      const query = requestUrl.searchParams.get('q') ?? '';

      await featuredSearchReleased;
      return respondSearch({
        customers: customerFixtures[query]?.customers ?? featuredCustomers,
      });
    });

    setBrowserLocation('/customers/search');
    const app = await loadBrowserHarness();
    await app.mountCustomerSearchScenario();

    await expect(
      page.getByRole('heading', { name: 'Customers' })
    ).toBeVisible();
    await expect(page.getByLabelText('Search customers')).toHaveValue('');
    await expect
      .element(page.getByRole('status'))
      .toHaveTextContent('Searching customers...');
    releaseFeaturedSearch();
    await expect
      .poll(() => page.getByText('Featured Customer').elements().length)
      .toBe(1);
  });

  test('should show an empty state when a query returns no matching customers', async () => {
    installCustomerSearchMock({
      missing: { customers: [], delayMs: 200 },
    });

    setBrowserLocation('/customers/search?q=missing');
    const app = await loadBrowserHarness();
    await app.mountCustomerSearchScenario();

    await expect(page.getByLabelText('Search customers')).toHaveValue(
      'missing'
    );
    await expect
      .element(page.getByRole('status'))
      .toHaveTextContent('Searching customers...');
    await expect
      .poll(() => page.getByText('No customers found.').elements().length)
      .toBe(1);
    await expect
      .poll(() => page.getByRole('listitem').elements().length)
      .toBe(0);
  });

  test('should load from the route query and refresh as the user searches @smoke', async () => {
    const queries: string[] = [];
    installCustomerSearchMock({}, (query) => {
      queries.push(query);
    });

    setBrowserLocation('/customers/search?q=northwind');
    const app = await loadBrowserHarness();
    await app.mountCustomerSearchScenario();

    const search = page.getByLabelText('Search customers');
    await expect(search).toHaveValue('northwind');
    await expect
      .poll(() => page.getByText('Northwind Traders').elements().length)
      .toBe(1);

    await search.fill('acme');

    await expect
      .poll(() => window.location.pathname + window.location.search)
      .toBe('/customers/search?q=acme');
    await expect(search).toHaveValue('acme');
    await expect
      .poll(() => page.getByText('Acme Corp').elements().length)
      .toBe(1);
    expect(queries).toContain('northwind');
    expect(queries).toContain('acme');
  });

  test('should trim whitespace from route-driven search input', async () => {
    const queries: string[] = [];
    installCustomerSearchMock({}, (query) => {
      queries.push(query);
    });

    setBrowserLocation('/customers/search');
    const app = await loadBrowserHarness();
    await app.mountCustomerSearchScenario();

    const search = page.getByLabelText('Search customers');
    await search.fill('   acme  ');

    await expect
      .poll(() => window.location.pathname + window.location.search)
      .toBe('/customers/search?q=acme');
    await expect(search).toHaveValue('acme');
    await expect
      .poll(() => page.getByText('Acme Corp').elements().length)
      .toBe(1);
    expect(queries).toEqual(['', 'acme']);
  });

  test('should ignore stale slower search responses', async () => {
    let releaseSlowSearch!: () => void;
    const slowSearchReleased = new Promise<void>((resolve) => {
      releaseSlowSearch = resolve;
    });
    const queries: string[] = [];

    mockJsonFetch(async (input: RequestInfo | URL) => {
      const requestUrl = new URL(
        input instanceof Request ? input.url : input.toString(),
        window.location.origin
      );
      const query = requestUrl.searchParams.get('q') ?? '';
      queries.push(query);

      if (query === 'northwind') {
        await slowSearchReleased;
        return respondSearch({
          ...customerFixtures.northwind,
          delayMs: 10,
        });
      }

      return respondSearch({
        ...customerFixtures[query],
        delayMs: query === 'acme' ? 10 : 0,
      });
    });

    setBrowserLocation('/customers/search?q=northwind');
    const app = await loadBrowserHarness();
    await app.mountCustomerSearchScenario();
    await expect
      .element(page.getByRole('status'))
      .toHaveTextContent('Searching customers...');

    await page.getByLabelText('Search customers').fill('acme');
    releaseSlowSearch();

    await expect
      .poll(() => window.location.pathname + window.location.search)
      .toBe('/customers/search?q=acme');
    await expect(page.getByLabelText('Search customers')).toHaveValue('acme');
    expect(queries).toContain('northwind');
    expect(queries).toContain('acme');
    await expect
      .poll(() => page.getByText('Northwind Traders').elements().length)
      .toBe(0);
  });

  test('should clear the query and fetch the default results', async () => {
    installCustomerSearchMock();

    setBrowserLocation('/customers/search?q=acme');
    const app = await loadBrowserHarness();
    await app.mountCustomerSearchScenario();
    await expect
      .poll(() => page.getByText('Acme Corp').elements().length)
      .toBe(1);

    await page.getByRole('button', { name: 'Clear search' }).click();

    await expect
      .poll(() => window.location.pathname + window.location.search)
      .toBe('/customers/search');
    await expect(page.getByLabelText('Search customers')).toHaveValue('');
    await expect
      .poll(() => page.getByText('Featured Customer').elements().length)
      .toBe(1);
  });

  test('should recover from a failed search when retry succeeds', async () => {
    let attempts = 0;

    mockJsonFetch(async (input: RequestInfo | URL) => {
      const requestUrl = new URL(
        input instanceof Request ? input.url : input.toString(),
        window.location.origin
      );
      const query = requestUrl.searchParams.get('q') ?? '';

      if (query === 'broken') {
        attempts += 1;
        if (attempts === 1) {
          return new Response(JSON.stringify({ message: 'failed' }), {
            status: 500,
            headers: { 'content-type': 'application/json' },
          });
        }
      }

      return respondSearch({
        customers: [
          {
            id: 'recovered',
            name: 'Recovered Customer',
            city: 'Boston',
            status: 'Active',
          },
        ],
      });
    });

    setBrowserLocation('/customers/search?q=broken');
    const app = await loadBrowserHarness();
    await app.mountCustomerSearchScenario();

    await expect
      .element(page.getByRole('alert'))
      .toHaveTextContent('Customer search failed.');
    await page.getByRole('button', { name: 'Retry search' }).click();

    await expect(page.getByText('Recovered Customer')).toBeVisible();
    await expect
      .poll(() => page.getByText('Recovered Customer').elements().length)
      .toBe(1);
    expect(attempts).toBe(2);
  });

  test('should keep the next route stable when navigation leaves a pending search behind', async () => {
    let releaseSlowSearch!: () => void;
    const slowSearchReleased = new Promise<void>((resolve) => {
      releaseSlowSearch = resolve;
    });

    mockJsonFetch(async (input: RequestInfo | URL) => {
      const requestUrl = new URL(
        input instanceof Request ? input.url : input.toString(),
        window.location.origin
      );
      const query = requestUrl.searchParams.get('q') ?? '';

      if (query === 'northwind') {
        await slowSearchReleased;
        try {
          return await respondSearch({
            ...customerFixtures.northwind,
            delayMs: 10,
          });
        } catch {
          return new Response('', { status: 499 });
        }
      }

      return respondSearch({
        ...customerFixtures[query],
        delayMs: query === 'acme' ? 10 : 0,
      });
    });

    setBrowserLocation('/customers/search?q=northwind');
    const app = await loadBrowserHarness();
    await app.mountCustomerSearchScenario();
    await expect
      .element(page.getByRole('status'))
      .toHaveTextContent('Searching customers...');

    await page.getByLabelText('Search customers').fill('acme');

    await expect
      .poll(() => page.getByText('Acme Corp').elements().length)
      .toBe(1);
    releaseSlowSearch();
    await expect
      .poll(() => page.getByText('Northwind Traders').elements().length)
      .toBe(0);
  });
});
// @askr-allow-real-timers -- browser integration uses network-style delays.
