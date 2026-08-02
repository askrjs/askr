import { expect, test } from 'vite-plus/test';
import { page } from 'vite-plus/test/browser/context';
import { loadBrowserHarness } from './_helpers';

test.describe('route data dehydration', () => {
  test.beforeEach(async () => {
    const app = await loadBrowserHarness();
    await app.mountRouteDataDehydrationScenario();
  });

  test('should diagnose an omitted branch through browser interaction', async () => {
    await page.getByRole('button', { name: 'Read omitted data' }).click();

    await expect
      .element(page.getByRole('alert'))
      .toHaveTextContent(
        /routeData\(\).*\$\.secret.*initial hydration.*client navigation/
      );
  });

  test('should expose the complete loader result after browser navigation', async () => {
    await expect.element(page.getByText('hydrated')).toBeVisible();
    await page.getByRole('button', { name: 'Load complete data' }).click();
    await expect.element(page.getByText('complete')).toBeVisible();
  });
});
