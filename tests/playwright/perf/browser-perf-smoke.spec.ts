import { expect, test } from '@playwright/test';

test.describe('browser performance smoke checks', () => {
  test('should collect coarse browser timing signals', async ({ page }) => {
    await page.goto('/?scenario=benchmark');

    const timings = await page.evaluate(() =>
      window.__askrPlaywright.runBrowserPerf()
    );

    expect(timings.mountMs).toBeGreaterThanOrEqual(0);
    expect(timings.updateMs).toBeGreaterThanOrEqual(0);
    expect(timings.firstInteractionMs).toBeGreaterThanOrEqual(0);
  });
});
