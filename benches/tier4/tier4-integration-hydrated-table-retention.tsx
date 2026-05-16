import { bench, describe, expect, vi } from 'vite-plus/test';
import { cleanupApp } from '../../src/boot';
import { loadBrowserHarness } from '../../tests/browser/_helpers';
import { flushScheduler } from '../../test-utils/render/test-renderer';
import {
  buildRows,
  extendBenchOptions,
  replaceRowLabelById,
  tier4BenchOptions,
} from '../shared/_shared';

type BrowserHarness = Awaited<ReturnType<typeof loadBrowserHarness>>;

const baseRows = buildRows(1_000);
const updatedRows = replaceRowLabelById(baseRows, 1, 'Item 1 !!!');
const hydratedTableRetentionBenchOptions = extendBenchOptions(
  tier4BenchOptions,
  {
    time: 2200,
    iterations: 3,
    warmupTime: 250,
    warmupIterations: 1,
  }
);

function ensureBrowserRoot(): HTMLDivElement {
  let root = document.getElementById('root');

  if (!root) {
    root = document.createElement('div');
    root.id = 'root';
    document.body.appendChild(root);
  } else {
    root.innerHTML = '';
  }

  return root as HTMLDivElement;
}

function resetBrowserRoot(): HTMLDivElement {
  const root = ensureBrowserRoot();
  cleanupApp(root);
  root.innerHTML = '';
  return root;
}

async function loadBrowserHarnessWithRoot(): Promise<BrowserHarness> {
  resetBrowserRoot();
  vi.resetModules();
  return loadBrowserHarness();
}

await (async () => {
  const app = await loadBrowserHarnessWithRoot();
  const root = document.getElementById('root') as HTMLDivElement;

  try {
    await app.mountHydratedBenchmarkTableScenario(baseRows);
    flushScheduler();

    expect(document.querySelectorAll('tbody tr')).toHaveLength(1_000);

    app.setHydratedSelected(1);
    app.setHydratedRows(updatedRows);
    flushScheduler();

    expect(
      document.querySelector('tbody tr:first-child td:nth-child(2) a')
        ?.textContent
    ).toBe('Item 1 !!!');

    cleanupApp(root);
    flushScheduler();
    root.innerHTML = '';

    expect(document.querySelector('tbody tr')).toBeNull();
  } finally {
    resetBrowserRoot();
  }
})();

describe('tier4 integration hydrated table retention', () => {
  let app: BrowserHarness | null = null;
  let root: HTMLDivElement | null = null;

  bench(
    'hydrate, mutate, and tear down the benchmark table',
    async () => {
      await app!.mountHydratedBenchmarkTableScenario(baseRows);
      flushScheduler();

      app!.setHydratedSelected(1);
      app!.setHydratedRows(updatedRows);
      flushScheduler();

      cleanupApp(root!);
      flushScheduler();
      root!.innerHTML = '';
    },
    {
      ...hydratedTableRetentionBenchOptions,
      async setup() {
        root = resetBrowserRoot();
        vi.resetModules();
        app = await loadBrowserHarness();
      },
      teardown() {
        resetBrowserRoot();
        app = null;
        root = null;
      },
    }
  );
});
