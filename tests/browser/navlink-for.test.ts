import { expect, test } from 'vite-plus/test';
import { page } from 'vite-plus/test/browser/context';
import { loadBrowserHarness, setBrowserLocation } from './_helpers';

test.describe('NavLink-like behavior in For', () => {
  test.beforeEach(async () => {
    setBrowserLocation('/dashboard');
    const app = await loadBrowserHarness();
    await app.mountNavLinkForScenario();
  });

  test('should update the active link when navigation changes inside a For list', async () => {
    const dashboardLink = page.getByRole('link', { name: 'Dashboard' });
    const customersLink = page.getByRole('link', { name: 'Customers' });
    const settingsLink = page.getByRole('link', { name: 'Settings' });

    await expect(dashboardLink).toHaveAttribute('aria-current', 'page');
    await expect(dashboardLink).toHaveAttribute('data-active', 'true');
    await expect(customersLink).not.toHaveAttribute('aria-current');
    await expect(settingsLink).not.toHaveAttribute('aria-current');

    await customersLink.click();

    await expect
      .poll(() => window.location.pathname + window.location.search)
      .toBe('/customers/search');
    await expect(customersLink).toHaveAttribute('aria-current', 'page');
    await expect(customersLink).toHaveAttribute('data-active', 'true');
    await expect(dashboardLink).not.toHaveAttribute('aria-current');
    await expect(settingsLink).not.toHaveAttribute('aria-current');

    await settingsLink.click();

    await expect
      .poll(() => window.location.pathname + window.location.search)
      .toBe('/settings');
    await expect(settingsLink).toHaveAttribute('aria-current', 'page');
    await expect(settingsLink).toHaveAttribute('data-active', 'true');
    await expect(customersLink).not.toHaveAttribute('aria-current');
    await expect(dashboardLink).not.toHaveAttribute('aria-current');
  });
});
