import { expect, test } from '@playwright/test';

test.describe('guarded browser routing', () => {
  test('should redirect a guarded route and update browser history @smoke', async ({
    page,
  }) => {
    await page.goto('/?scenario=guarded');
    await expect(
      page.getByRole('heading', { name: 'Router Home' })
    ).toBeVisible();

    await page.getByTestId('private-link').click();

    await expect(page).toHaveURL(/\/login\?next=\/private$/);
    await expect(page.getByRole('heading', { name: 'Login' })).toBeVisible();
    await expect(page.getByTestId('login-next')).toHaveText('?next=/private');

    await page.getByTestId('home-link').click();
    await expect(page).toHaveURL(/\/$/);
    await expect(
      page.getByRole('heading', { name: 'Router Home' })
    ).toBeVisible();
  });
});
