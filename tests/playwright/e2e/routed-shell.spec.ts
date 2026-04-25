import { expect, test } from '@playwright/test';

test.describe('routed shell browser behavior', () => {
  test('should preserve typed input state through routed shell updates @smoke', async ({
    page,
  }) => {
    await page.goto('/?scenario=routed-shell');

    await expect(page).toHaveURL(/\/example\?scenario=routed-shell$/);
    await expect(
      page.getByRole('heading', { name: 'Routed Shell' })
    ).toBeVisible();

    const input = page.getByTestId('routed-name');

    await input.click();
    await input.pressSequentially('Northwind');

    await expect(input).toBeFocused();
    await expect(input).toHaveValue('Northwind');
    await expect(page.getByTestId('routed-preview')).toHaveText('Northwind');

    await page.getByTestId('about-link').click();

    await expect(page).toHaveURL(/\/about\?scenario=routed-shell$/);
    await expect(page.getByRole('heading', { name: 'About' })).toBeVisible();
    await expect(page.getByTestId('about-copy')).toHaveText('About page');
  });
});