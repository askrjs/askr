import { expect, test, type Page } from '@playwright/test';

async function mockShellCustomerSearch(page: Page): Promise<void> {
  await page.route('**/api/customers/search**', async (route) => {
    const requestUrl = new URL(route.request().url());
    const query = requestUrl.searchParams.get('q') ?? '';
    const name = query ? `Customer ${query}` : 'Featured Customer';

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        customers: [
          {
            id: query || 'featured',
            name,
            city: 'Seattle',
            status: 'Active',
          },
        ],
      }),
    });
  });
}

test.describe('real routed app shell workflow', () => {
  test('should keep the shell and search focus during same-route query updates @smoke', async ({
    page,
  }) => {
    await mockShellCustomerSearch(page);
    await page.goto('/customers/search');

    const search = page.getByLabel('Search customers');
    await search.click();
    await search.pressSequentially('globex');

    await expect(page).toHaveURL(/\/customers\/search\?q=globex$/);
    await expect(search).toBeFocused();
    await expect(page.getByRole('heading', { name: 'Askr CRM' })).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Customers' })
    ).toHaveAttribute('aria-current', 'page');
    await expect(page.getByText('Customer globex')).toBeVisible();
  });

  test('should preserve a settings draft after navigating away and back', async ({
    page,
  }) => {
    await page.goto('/settings');

    await page.getByLabel('Full name').fill('Route User');
    await expect(page.getByLabel('Settings preview')).toHaveText(
      'Route User will be saved as viewer with email contact.'
    );

    await page.getByRole('button', { name: 'Dashboard' }).click();
    await expect(
      page.getByRole('heading', { name: 'Dashboard' })
    ).toBeVisible();

    await page.getByRole('button', { name: 'Settings' }).click();
    await expect(page.getByLabel('Full name')).toHaveValue('Route User');
    await expect(page.getByLabel('Settings preview')).toHaveText(
      'Route User will be saved as viewer with email contact.'
    );
  });

  test('should support browser back and forward across app pages', async ({
    page,
  }) => {
    await mockShellCustomerSearch(page);
    await page.goto('/dashboard');

    await page.getByRole('button', { name: 'Customers' }).click();
    await expect(page).toHaveURL(/\/customers\/search$/);
    await expect(
      page.getByRole('heading', { name: 'Customers' })
    ).toBeVisible();

    await page.getByRole('button', { name: 'Settings' }).click();
    await expect(page).toHaveURL(/\/settings$/);
    await expect(
      page.getByRole('heading', { name: 'Account settings' })
    ).toBeVisible();

    await page.goBack();
    await expect(page).toHaveURL(/\/customers\/search$/);
    await expect(
      page.getByRole('heading', { name: 'Customers' })
    ).toBeVisible();

    await page.goForward();
    await expect(page).toHaveURL(/\/settings$/);
    await expect(
      page.getByRole('heading', { name: 'Account settings' })
    ).toBeVisible();
  });

  test('should navigate from dashboard to an order detail route', async ({
    page,
  }) => {
    await page.goto('/dashboard');

    await page.getByRole('button', { name: 'View order 1002' }).click();

    await expect(page).toHaveURL(/\/orders\/1002$/);
    await expect(
      page.getByRole('heading', { name: 'Order 1002' })
    ).toBeVisible();

    await page.getByRole('button', { name: 'Back to dashboard' }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(
      page.getByRole('heading', { name: 'Dashboard' })
    ).toBeVisible();
  });

  test('should not retain keyed card artifacts after route-to-route navigation', async ({
    page,
  }) => {
    await page.goto('/route-artifacts-a');

    await expect(
      page.getByRole('heading', { name: 'Route artifacts A' })
    ).toBeVisible();
    await expect(page.locator('[data-route-artifact="a"]')).toHaveCount(16);

    await page.getByRole('button', { name: 'Artifacts B' }).click();

    await expect(page).toHaveURL(/\/route-artifacts-b$/);
    await expect(
      page.getByRole('heading', { name: 'Route artifacts B' })
    ).toBeVisible();
    await expect(page.locator('[data-route-artifact="a"]')).toHaveCount(0);
    await expect(page.getByText('A loose text artifact')).toHaveCount(0);
    await expect(page.getByText('A large keyed row')).toHaveCount(0);
    await expect(
      page.locator('[data-testid="route-large-keyed-list"] > div').first()
    ).toHaveText('B large keyed row 79');
    await expect(page.locator('article.artifact-card')).toHaveCount(16);
    await expect(
      page.locator('article.artifact-card').first().locator('*')
    ).toHaveCount(2);

    await page.getByRole('button', { name: 'Artifacts A' }).click();
    await page.getByRole('button', { name: 'Artifacts B' }).click();

    await expect(page.locator('[data-route-artifact="a"]')).toHaveCount(0);
  });
});
