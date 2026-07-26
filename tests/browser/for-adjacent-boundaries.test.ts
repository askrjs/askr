import { expect, test } from 'vite-plus/test';
import { page } from 'vite-plus/test/browser/context';
import { loadBrowserHarness } from './_helpers';

test('should preserve adjacent For DOM ranges after a browser rerender', async () => {
  const app = await loadBrowserHarness();
  app.mountAdjacentForBoundariesScenario();

  await page.getByRole('button', { name: 'Rerender adjacent lists' }).click();

  await expect
    .poll(() =>
      document.querySelector('[data-revision]')?.getAttribute('data-revision')
    )
    .toBe('1');
  await expect
    .poll(
      () =>
        document.querySelector('[data-link="fit"]')?.parentElement?.className
    )
    .toBe('prose-stack');
  expect(document.querySelectorAll('.evidence-grid [data-link]')).toHaveLength(
    0
  );
  expect(document.querySelectorAll('[data-row]')).toHaveLength(2);
  expect(document.querySelectorAll('[data-work]')).toHaveLength(2);
});
