import fs from 'node:fs/promises';
import path from 'node:path';
import { expect, test } from '@playwright/test';

test.describe('browser benchmark trends', () => {
  test('should capture browser benchmark timing trends', async ({ page }) => {
    await page.goto('/?scenario=benchmark');

    const timings = await page.evaluate(() =>
      window.__askrPlaywright.runBrowserPerf()
    );

    await fs.mkdir('bench-results', { recursive: true });
    await fs.writeFile(
      path.join('bench-results', 'browser.json'),
      `${JSON.stringify(
        {
          schemaVersion: 1,
          capturedAt: new Date().toISOString(),
          lane: 'browser',
          timings,
        },
        null,
        2
      )}\n`,
      'utf8'
    );

    expect(timings.mountMs).toBeGreaterThanOrEqual(0);
    expect(timings.updateMs).toBeGreaterThanOrEqual(0);
    expect(timings.firstInteractionMs).toBeGreaterThanOrEqual(0);
  });
});
