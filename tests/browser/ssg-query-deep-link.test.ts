import { expect, test } from 'vite-plus/test';
import { page } from 'vite-plus/test/browser/context';
import { loadBrowserHarness } from './_helpers';

test('should strictly hydrate a mounted static query deep link without replacing its DOM', async () => {
  const app = await loadBrowserHarness();
  const result = await app.mountStaticQueryDeepLinkScenario();

  expect(result).toEqual({
    preserved: true,
    text: 'pig|2|#results',
  });
  await expect.element(page.getByText('pig|2|#results')).toBeVisible();
});
