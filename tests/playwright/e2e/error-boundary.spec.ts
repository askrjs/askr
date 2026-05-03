import { expect, test } from '@playwright/test';

test.describe('ErrorBoundary browser behavior', () => {
  test('should render a visible fallback and recover from the fallback UI @smoke', async ({
    page,
  }) => {
    await page.goto('/?scenario=error-boundary');

    await expect(page.getByTestId('boundary-fallback')).toBeVisible();
    await expect(page.getByTestId('boundary-message')).toHaveText(
      'fixture crash'
    );

    await page.getByTestId('retry').click();
    await expect(page.getByTestId('safe-content')).toBeVisible();
  });
});
