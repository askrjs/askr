import { expect, test } from 'vite-plus/test';
import { page } from 'vite-plus/test/browser/context';
import { userEvent } from 'vitest/browser';
import { loadBrowserHarness } from './_helpers';

test.describe('real browser interaction behavior', () => {
  test.beforeEach(async () => {
    const app = await loadBrowserHarness();
    app.mountInteractionScenario();
  });

  test('should support navigation and keyboard focus in the browser @smoke', async () => {
    await page.getByTestId('settings-link').click();
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();

    await userEvent.keyboard('{Tab}');
    await expect.element(page.getByTestId('menu-trigger')).toHaveFocus();

    await page.getByTestId('menu-trigger').click();
    await expect(page.getByRole('menu')).toBeVisible();
    await expect(page.getByRole('menuitem', { name: 'Profile' })).toBeVisible();
  });
});
