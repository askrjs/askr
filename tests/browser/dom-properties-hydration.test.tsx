import { expect, test } from 'vite-plus/test';
import { loadBrowserHarness } from './_helpers';
import {
  hydrationProbeConfig,
  type HydrationProbe,
} from '../../test-utils/playwright-app/src/scenarios/dom-properties-hydration';

test('should serialize reflecting properties only and apply the rest on hydration', async () => {
  const app = await loadBrowserHarness();
  const html = await app.mountDomPropertiesHydrationScenario();

  expect(html).toContain('<video muted');
  expect(html).not.toContain('indeterminate');
  expect(html).not.toContain('config');
  expect(html).not.toContain('items');
  expect(html).not.toContain('prop:');
  expect(html).not.toContain('attr:');
  expect(html).toContain('data-mode="raw"');

  const root = document.getElementById('root')!;
  expect(root.dataset.hydratedInPlace).toBe('true');

  const video = root.querySelector('video')!;
  const input = root.querySelector('input')!;
  const probe = root.querySelector('x-hydration-probe') as HydrationProbe;
  expect(video.muted).toBe(true);
  expect(input.indeterminate).toBe(true);
  expect(probe.config).toBe(hydrationProbeConfig);
  expect(probe.items).toEqual([1]);
  expect(probe.getAttribute('data-mode')).toBe('raw');
});
