import { expect, test } from '@playwright/test';

test.describe('order management table workflow', () => {
  test('should preserve selected row and row note across sorting @smoke', async ({
    page,
  }) => {
    await page.goto('/?scenario=order-table');

    await page.getByRole('button', { name: 'Select order 1001' }).click();
    await page.getByLabel('Note for order 1001').fill('Follow up tomorrow');
    await page.getByRole('button', { name: 'Sort by total' }).click();

    const northwindRow = page.getByRole('row', {
      name: /1001 Northwind Traders/,
    });
    await expect(northwindRow).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByLabel('Note for order 1001')).toHaveValue(
      'Follow up tomorrow'
    );
  });

  test('should filter by customer text and status', async ({ page }) => {
    await page.goto('/?scenario=order-table');

    await page.getByLabel('Filter orders').fill('Austin');

    await expect(page.getByText('Acme Corp')).toBeVisible();
    await expect(page.getByText('Northwind Traders')).toHaveCount(0);

    await page.getByLabel('Status').selectOption('Open');
    await expect(page.getByText('No orders found.')).toBeVisible();

    await page.getByLabel('Filter orders').fill('');
    await expect(page.getByText('Northwind Traders')).toBeVisible();
    await expect(page.getByText('Globex')).toBeVisible();
    await expect(page.getByText('Acme Corp')).toHaveCount(0);
  });

  test('should remove rows and restore clean row state', async ({ page }) => {
    await page.goto('/?scenario=order-table');

    await page.getByLabel('Note for order 1002').fill('Call billing');
    await page.getByRole('button', { name: 'Remove order 1002' }).click();

    await expect(page.getByText('Acme Corp')).toHaveCount(0);
    await expect(page.getByLabel('Note for order 1002')).toHaveCount(0);

    await page.getByRole('button', { name: 'Restore orders' }).click();

    await expect(page.getByText('Acme Corp')).toBeVisible();
    await expect(page.getByLabel('Note for order 1002')).toHaveValue(
      'Paid by card'
    );

    await page.getByRole('button', { name: 'Select order 1002' }).click();
    await expect(
      page.getByRole('row', { name: /1002 Acme Corp/ })
    ).toHaveAttribute('aria-selected', 'true');
  });

  test('should show an empty state after clearing all orders', async ({
    page,
  }) => {
    await page.goto('/?scenario=order-table');

    await page.getByRole('button', { name: 'Clear orders' }).click();

    await expect(page.getByText('No orders found.')).toBeVisible();

    await page.getByRole('button', { name: 'Restore orders' }).click();
    await expect(page.getByText('Northwind Traders')).toBeVisible();
  });
});
