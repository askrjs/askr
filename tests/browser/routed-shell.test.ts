import { expect, test } from 'vite-plus/test';
import { page } from 'vite-plus/test/browser/context';
import { userEvent } from 'vitest/browser';
import { loadBrowserHarness, setBrowserLocation } from './_helpers';
import { vi } from 'vite-plus/test';

function installCustomerSearchMock(): void {
  const responses: Record<
    string,
    {
      customers: Array<{
        id: string;
        name: string;
        city: string;
        status: string;
      }>;
    }
  > = {
    '': {
      customers: [
        {
          id: 'featured-1',
          name: 'Featured Customer',
          city: 'Portland',
          status: 'Active',
        },
      ],
    },
    globex: {
      customers: [
        {
          id: 'globex',
          name: 'Customer globex',
          city: 'Chicago',
          status: 'Active',
        },
      ],
    },
  };

  vi.stubGlobal('fetch', async (input: RequestInfo | URL) => {
    const requestUrl = new URL(input.toString(), window.location.origin);
    const query = requestUrl.searchParams.get('q') ?? '';
    return new Response(JSON.stringify(responses[query] ?? responses['']), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  });
}

test.describe('real routed app shell workflow', () => {
  test('should keep the shell and search focus during same-route query updates @smoke', async () => {
    installCustomerSearchMock();
    setBrowserLocation('/customers/search');
    const app = await loadBrowserHarness();
    await app.mountRoutedShellScenario();

    const search = page.getByLabelText('Search customers');
    await search.click();
    const input = search.element();
    await userEvent.keyboard('globex');

    await expect
      .poll(() => window.location.pathname + window.location.search)
      .toBe('/customers/search?q=globex');
    expect(search.element()).toBe(input);
    await expect.element(search).toHaveFocus();
    await expect(page.getByRole('heading', { name: 'Askr CRM' })).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Customers' })
    ).toHaveAttribute('aria-current', 'page');
    await expect
      .poll(() => page.getByText('Customer globex').elements().length)
      .toBe(1);
  });

  test('should reset a route-local settings draft after navigating away and back', async () => {
    setBrowserLocation('/settings');
    const app = await loadBrowserHarness();
    await app.mountRoutedShellScenario();
    const shell = document.querySelector('[aria-label="Askr CRM"]');

    await page.getByLabelText('Full name').fill('Route User');
    await expect
      .element(page.getByLabelText('Settings preview'))
      .toHaveTextContent(
        'Route User will be saved as viewer with email contact.'
      );

    await page.getByRole('button', { name: 'Dashboard' }).click();
    await expect(
      page.getByRole('heading', { name: 'Dashboard' })
    ).toBeVisible();

    await page.getByRole('button', { name: 'Settings' }).click();
    expect(document.querySelector('[aria-label="Askr CRM"]')).toBe(shell);
    await expect(page.getByLabelText('Full name')).toHaveValue('');
    await expect
      .element(page.getByLabelText('Settings preview'))
      .toHaveTextContent('Enter account details to preview changes.');
  });

  test('should support browser back and forward across app pages', async () => {
    setBrowserLocation('/dashboard');
    const app = await loadBrowserHarness();
    await app.mountRoutedShellScenario();

    await page.getByRole('button', { name: 'Customers' }).click();
    await expect
      .poll(() => window.location.pathname + window.location.search)
      .toBe('/customers/search');
    await expect(
      page.getByRole('heading', { name: 'Customers' })
    ).toBeVisible();

    await page.getByRole('button', { name: 'Settings' }).click();
    await expect
      .poll(() => window.location.pathname + window.location.search)
      .toBe('/settings');
    await expect(
      page.getByRole('heading', { name: 'Account settings' })
    ).toBeVisible();

    window.history.back();
    await expect
      .poll(() => window.location.pathname + window.location.search)
      .toBe('/customers/search');
    await expect(
      page.getByRole('heading', { name: 'Customers' })
    ).toBeVisible();

    window.history.forward();
    await expect
      .poll(() => window.location.pathname + window.location.search)
      .toBe('/settings');
    await expect(
      page.getByRole('heading', { name: 'Account settings' })
    ).toBeVisible();
  });

  test('should navigate from dashboard to an order detail route', async () => {
    setBrowserLocation('/dashboard');
    const app = await loadBrowserHarness();
    await app.mountRoutedShellScenario();

    await page.getByRole('button', { name: 'View order 1002' }).click();

    await expect
      .poll(() => window.location.pathname + window.location.search)
      .toBe('/orders/1002');
    await expect(
      page.getByRole('heading', { name: 'Order 1002' })
    ).toBeVisible();

    await page.getByRole('button', { name: 'Back to dashboard' }).click();
    await expect
      .poll(() => window.location.pathname + window.location.search)
      .toBe('/dashboard');
    await expect(
      page.getByRole('heading', { name: 'Dashboard' })
    ).toBeVisible();
  });

  test('should not retain keyed card artifacts after route-to-route navigation', async () => {
    setBrowserLocation('/route-artifacts-a');
    const app = await loadBrowserHarness();
    await app.mountRoutedShellScenario();

    await expect(
      page.getByRole('heading', { name: 'Route artifacts A' })
    ).toBeVisible();
    await expect
      .poll(() => document.querySelectorAll('[data-route-artifact="a"]').length)
      .toBe(16);

    await page.getByRole('button', { name: 'Artifacts B' }).click();

    await expect
      .poll(() => window.location.pathname + window.location.search)
      .toBe('/route-artifacts-b');
    await expect(
      page.getByRole('heading', { name: 'Route artifacts B' })
    ).toBeVisible();
    await expect
      .poll(() => document.querySelectorAll('[data-route-artifact="a"]').length)
      .toBe(0);
    await expect
      .poll(() => page.getByText('A loose text artifact').elements().length)
      .toBe(0);
    await expect
      .poll(() => page.getByText('A large keyed row').elements().length)
      .toBe(0);
    await expect
      .poll(
        () =>
          document.querySelector('[data-testid="route-large-keyed-list"] > div')
            ?.textContent ?? ''
      )
      .toBe('B large keyed row 79');
    await expect
      .poll(() => document.querySelectorAll('article.artifact-card').length)
      .toBe(16);
    await expect
      .poll(
        () =>
          document.querySelector('article.artifact-card')?.children.length ?? 0
      )
      .toBe(2);

    await page.getByRole('button', { name: 'Artifacts A' }).click();
    await page.getByRole('button', { name: 'Artifacts B' }).click();

    await expect
      .poll(() => document.querySelectorAll('[data-route-artifact="a"]').length)
      .toBe(0);
  });
});
