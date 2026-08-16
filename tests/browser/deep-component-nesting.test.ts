import { expect, test } from 'vite-plus/test';
import { loadBrowserHarness } from './_helpers';

const nestingDepth = 10_000;

test('should mount a deep component chain without overflowing the browser stack', async () => {
  const app = await loadBrowserHarness();

  expect(() =>
    app.mountDeepComponentNestingScenario(nestingDepth)
  ).not.toThrow();
  expect(document.querySelector('[data-depth-leaf="true"]')?.textContent).toBe(
    'leaf'
  );
});
