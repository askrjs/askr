import { expect, test } from 'vite-plus/test';
import { page } from 'vite-plus/test/browser/context';
import { loadBrowserHarness } from './_helpers';

test.describe('benchmark browser behavior', () => {
  test.beforeEach(async () => {
    const app = await loadBrowserHarness();
    app.mountBenchmarkScenario();
  });

  test('should apply row selection through a real browser click @smoke', async () => {
    const secondRow = page.getByRole('row').nth(1);
    await expect(page.getByText('Item 2')).toBeVisible();

    await page.getByText('Item 2').click();

    await expect(secondRow).toHaveClass(/danger/);
  });

  test('should render rows after programmatic updates in the browser', async () => {
    const app = await loadBrowserHarness();
    app.setRows([
      { id: 7, label: 'Alpha' },
      { id: 8, label: 'Beta' },
    ]);

    await expect(page.getByText('Alpha')).toBeVisible();
    await expect(page.getByText('Beta')).toBeVisible();
    await expect.element(page.getByRole('row').nth(0)).toHaveTextContent('7');
  });
});
