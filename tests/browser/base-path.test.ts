import { expect, test } from 'vite-plus/test';
import { page } from 'vite-plus/test/browser/context';
import { loadBrowserHarness } from './_helpers';

test.describe('route base paths', () => {
  test.beforeEach(async () => {
    const app = await loadBrowserHarness();
    await app.mountBasePathScenario();
  });

  test('should publish mounted links and preserve logical route state', async () => {
    const review = page.getByRole('link', { name: 'Open review' });
    await expect
      .element(review)
      .toHaveAttribute('href', '/website/reviews/browser');
    await review.click();

    await expect
      .element(page.getByText('browser', { exact: true }))
      .toBeVisible();
    await expect
      .element(page.getByTestId('logical-path'))
      .toHaveTextContent('/reviews/browser');
    expect(window.location.pathname).toBe('/website/reviews/browser');

    await page.getByRole('button', { name: 'Compact view' }).click();
    expect(window.location.pathname).toBe('/website/reviews/browser');
    expect(window.location.search).toBe('?view=compact');
    await expect
      .element(page.getByRole('link', { name: 'Home' }))
      .toHaveAttribute('href', '/website/');
  });
});
