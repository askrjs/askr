import { expect, test } from '@playwright/test';

test.describe('benchmark browser behavior', () => {
  test('should apply row selection through a real browser click @smoke', async ({
    page,
  }) => {
    await page.goto('/?scenario=benchmark');

    const secondRow = page.getByRole('row').nth(1);
    await expect(page.getByText('Item 2')).toBeVisible();

    await page.getByText('Item 2').click();

    await expect(secondRow).toHaveClass(/danger/);
  });

  test('should render rows after programmatic updates in the browser', async ({
    page,
  }) => {
    await page.goto('/?scenario=benchmark');

    await page.evaluate(() => {
      window.__askrPlaywright.setRows([
        { id: 7, label: 'Alpha' },
        { id: 8, label: 'Beta' },
      ]);
    });

    await expect(page.getByText('Alpha')).toBeVisible();
    await expect(page.getByText('Beta')).toBeVisible();
    await expect(page.getByRole('row').nth(0)).toContainText('7');
  });
});
