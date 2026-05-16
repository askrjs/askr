import { expect, test } from 'vite-plus/test';
import { page } from 'vite-plus/test/browser/context';
import { loadBrowserHarness } from './_helpers';

test.describe('order management table workflow', () => {
  test.beforeEach(async () => {
    const app = await loadBrowserHarness();
    app.mountOrdersScenario();
  });

  test('should preserve selected row and row note across sorting @smoke', async () => {
    await page.getByRole('button', { name: 'Select order 1001' }).click();
    await page.getByLabelText('Note for order 1001').fill('Follow up tomorrow');
    await page.getByRole('button', { name: 'Sort by total' }).click();

    const northwindRow = page.getByRole('row', {
      name: /1001 Northwind Traders/,
    });
    await expect(northwindRow).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByLabelText('Note for order 1001')).toHaveValue(
      'Follow up tomorrow'
    );
  });

  test('should filter by customer text and status', async () => {
    await page.getByLabelText('Filter orders').fill('Austin');

    await expect(page.getByText('Acme Corp')).toBeVisible();
    await expect
      .poll(() => page.getByText('Northwind Traders').elements().length)
      .toBe(0);

    await page.getByLabelText('Status').selectOptions('Open');
    await expect(page.getByText('No orders found.')).toBeVisible();

    await page.getByLabelText('Filter orders').fill('');
    await expect(page.getByText('Northwind Traders')).toBeVisible();
    await expect(page.getByText('Globex')).toBeVisible();
    await expect
      .poll(() => page.getByText('Acme Corp').elements().length)
      .toBe(0);
  });

  test('should remove rows and restore clean row state', async () => {
    await page.getByLabelText('Note for order 1002').fill('Call billing');
    await page.getByRole('button', { name: 'Remove order 1002' }).click();

    await expect
      .poll(() => page.getByText('Acme Corp').elements().length)
      .toBe(0);
    await expect
      .poll(() => page.getByLabelText('Note for order 1002').elements().length)
      .toBe(0);

    await page.getByRole('button', { name: 'Restore orders' }).click();

    await expect(page.getByText('Acme Corp')).toBeVisible();
    await expect(page.getByLabelText('Note for order 1002')).toHaveValue(
      'Paid by card'
    );

    await page.getByRole('button', { name: 'Select order 1002' }).click();
    await expect(
      page.getByRole('row', { name: /1002 Acme Corp/ })
    ).toHaveAttribute('aria-selected', 'true');
  });

  test('should show an empty state after clearing all orders', async () => {
    await page.getByRole('button', { name: 'Clear orders' }).click();

    await expect(page.getByText('No orders found.')).toBeVisible();

    await page.getByRole('button', { name: 'Restore orders' }).click();
    await expect(page.getByText('Northwind Traders')).toBeVisible();
  });
});
