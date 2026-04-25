import { expect, test } from '@playwright/test';

test.describe('real browser interaction behavior', () => {
  test('should support navigation and keyboard focus in the browser @smoke', async ({
    page,
  }) => {
    await page.goto('/?scenario=interaction');

    await page.getByTestId('settings-link').click();
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();

    await page.keyboard.press('Tab');
    await expect(page.getByTestId('menu-trigger')).toBeFocused();

    await page.getByTestId('menu-trigger').click();
    await expect(page.getByRole('menu')).toBeVisible();
    await expect(page.getByRole('menuitem', { name: 'Profile' })).toBeVisible();
  });
});
