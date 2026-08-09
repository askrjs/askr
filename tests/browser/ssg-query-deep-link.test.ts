import { expect, test } from 'vite-plus/test';
import { page } from 'vite-plus/test/browser/context';
import { loadBrowserHarness } from './_helpers';

test('should keep a mounted static query deep link reactive after hydration', async () => {
  const app = await loadBrowserHarness();
  const result = await app.mountStaticQueryDeepLinkScenario();

  expect(result).toEqual({
    preserved: true,
    text: 'pig|2|#results',
    updatedText: 'owl|3|#results',
  });
  await expect.element(page.getByText('owl|3|#results')).toBeVisible();
});
