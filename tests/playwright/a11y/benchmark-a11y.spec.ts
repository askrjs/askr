import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test.describe('browser accessibility checks', () => {
  test('should have no automated accessibility violations in the benchmark fixture', async ({
    page,
  }) => {
    await page.goto('/?scenario=benchmark');

    const results = await new AxeBuilder({ page }).analyze();

    expect(results.violations).toEqual([]);
  });
});
