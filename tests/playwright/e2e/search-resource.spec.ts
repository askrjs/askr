import { expect, test, type Page, type Route } from '@playwright/test';

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

async function fulfillSearch(
  route: Route,
  fixture: SearchFixture
): Promise<void> {
  if (fixture.delayMs) {
    await wait(fixture.delayMs);
  }

  await route.fulfill({
    status: fixture.status ?? 200,
    contentType: 'application/json',
    body: JSON.stringify({ customers: fixture.customers }),
  });
}

async function mockCustomerSearch(
  page: Page,
  overrides: Record<string, SearchFixture> = {}
): Promise<string[]> {
  const queries: string[] = [];

  await page.route('**/api/customers/search**', async (route) => {
    const requestUrl = new URL(route.request().url());
    const query = requestUrl.searchParams.get('q') ?? '';
    queries.push(query);

    await fulfillSearch(route, {
      customers: [],
      ...customerFixtures[query],
      ...overrides[query],
    });
  });

  return queries;
}

test.describe('customer search with route-driven resources', () => {
  test('should render an empty search and load featured customers', async ({
    page,
  }) => {
    await mockCustomerSearch(page, {
      '': { customers: featuredCustomers, delayMs: 200 },
    });

    await page.goto('/customers/search');

    await expect(
      page.getByRole('heading', { name: 'Customers' })
    ).toBeVisible();
    await expect(page.getByLabel('Search customers')).toHaveValue('');
    await expect(page.getByRole('status')).toHaveText('Searching customers...');
    await expect(page.getByText('Featured Customer')).toBeVisible();
  });

  test('should show an empty state when a query returns no matching customers', async ({
    page,
  }) => {
    await mockCustomerSearch(page, {
      missing: { customers: [], delayMs: 200 },
    });

    await page.goto('/customers/search?q=missing');

    await expect(page.getByLabel('Search customers')).toHaveValue('missing');
    await expect(page.getByRole('status')).toHaveText('Searching customers...');
    await expect(page.getByText('No customers found.')).toBeVisible();
    await expect(page.getByRole('listitem')).toHaveCount(0);
  });

  test('should load from the route query and refresh as the user searches @smoke', async ({
    page,
  }) => {
    const queries = await mockCustomerSearch(page);

    await page.goto('/customers/search?q=northwind');

    const search = page.getByLabel('Search customers');
    await expect(search).toHaveValue('northwind');
    await expect(page.getByText('Northwind Traders')).toBeVisible();

    await search.fill('acme');

    await expect(page).toHaveURL(/\/customers\/search\?q=acme$/);
    await expect(search).toHaveValue('acme');
    await expect(page.getByText('Acme Corp')).toBeVisible();
    expect(queries).toContain('northwind');
    expect(queries).toContain('acme');
  });

  test('should ignore stale slower search responses', async ({ page }) => {
    let finishSlowSearch!: () => void;
    const slowSearchFinished = new Promise<void>((resolve) => {
      finishSlowSearch = resolve;
    });

    await page.route('**/api/customers/search**', async (route) => {
      const requestUrl = new URL(route.request().url());
      const query = requestUrl.searchParams.get('q') ?? '';

      if (query === 'northwind') {
        try {
          await fulfillSearch(route, {
            ...customerFixtures.northwind,
            delayMs: 150,
          });
        } finally {
          finishSlowSearch();
        }
        return;
      }

      await fulfillSearch(route, {
        customers: [],
        ...customerFixtures[query],
        delayMs: query === 'acme' ? 10 : 0,
      });
    });

    await page.goto('/customers/search?q=northwind');
    await expect(page.getByRole('status')).toHaveText('Searching customers...');

    await page.getByLabel('Search customers').fill('acme');

    await expect(page.getByText('Acme Corp')).toBeVisible();
    await slowSearchFinished;
    await expect(page.getByText('Northwind Traders')).toHaveCount(0);
  });

  test('should clear the query and fetch the default results', async ({
    page,
  }) => {
    await mockCustomerSearch(page);

    await page.goto('/customers/search?q=acme');
    await expect(page.getByText('Acme Corp')).toBeVisible();

    await page.getByRole('button', { name: 'Clear search' }).click();

    await expect(page).toHaveURL(/\/customers\/search$/);
    await expect(page.getByLabel('Search customers')).toHaveValue('');
    await expect(page.getByText('Featured Customer')).toBeVisible();
  });

  test('should recover from a failed search when retry succeeds', async ({
    page,
  }) => {
    let attempts = 0;

    await page.route('**/api/customers/search**', async (route) => {
      const requestUrl = new URL(route.request().url());
      const query = requestUrl.searchParams.get('q') ?? '';

      if (query === 'broken') {
        attempts += 1;
        if (attempts === 1) {
          await route.fulfill({
            status: 500,
            contentType: 'application/json',
            body: JSON.stringify({ message: 'failed' }),
          });
          return;
        }
      }

      await fulfillSearch(route, {
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

    await page.goto('/customers/search?q=broken');

    await expect(page.getByRole('alert')).toHaveText('Customer search failed.');
    await page.getByRole('button', { name: 'Retry search' }).click();

    await expect(page.getByText('Recovered Customer')).toBeVisible();
    expect(attempts).toBe(2);
  });

  test('should keep the next route stable when navigation leaves a pending search behind', async ({
    page,
  }) => {
    let releaseSlowSearch!: () => void;
    const slowSearchReleased = new Promise<void>((resolve) => {
      releaseSlowSearch = resolve;
    });

    await page.route('**/api/customers/search**', async (route) => {
      const requestUrl = new URL(route.request().url());
      const query = requestUrl.searchParams.get('q') ?? '';

      if (query === 'northwind') {
        await slowSearchReleased;
        try {
          await fulfillSearch(route, {
            ...customerFixtures.northwind,
            delayMs: 10,
          });
        } catch {
          return;
        }
        return;
      }

      await fulfillSearch(route, {
        customers: [],
        ...customerFixtures[query],
      });
    });

    await page.goto('/customers/search?q=northwind');
    await expect(page.getByRole('status')).toHaveText('Searching customers...');

    await page.getByRole('button', { name: 'Dashboard' }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(
      page.getByRole('heading', { name: 'Dashboard' })
    ).toBeVisible();

    releaseSlowSearch();

    await expect(
      page.getByRole('heading', { name: 'Dashboard' })
    ).toBeVisible();
    await expect(page.getByText('Northwind Traders')).toHaveCount(0);
    await expect(page.getByRole('alert')).toHaveCount(0);
  });
});
