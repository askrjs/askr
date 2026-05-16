import { expect, test } from 'vite-plus/test';
import { page } from 'vite-plus/test/browser/context';
import { loadBrowserHarness } from './_helpers';

test.describe('ErrorBoundary browser behavior', () => {
  test.beforeEach(async () => {
    const app = await loadBrowserHarness();
    app.mountErrorBoundaryScenario();
  });

  test('should render a visible fallback and recover from the fallback UI @smoke', async () => {
    await expect(page.getByTestId('boundary-fallback')).toBeVisible();
    await expect
      .element(page.getByTestId('boundary-message'))
      .toHaveTextContent('fixture crash');

    await page.getByTestId('retry').click();
    await expect(page.getByTestId('safe-content')).toBeVisible();
  });
});
