import { bench, describe, expect } from 'vite-plus/test';
import { cleanupApp } from '../../src/boot';
import { loadBrowserHarness } from '../../tests/browser/_helpers';
import {
  buildRows,
  createRowToggle,
  tier4BenchOptions,
  type BenchToggle,
  type RowData,
  updateEveryNthRow,
} from '../shared/_shared';
import { flushScheduler } from '../../test-utils/render/test-renderer';

type BrowserHarness = Awaited<ReturnType<typeof loadBrowserHarness>>;

const baseRows = buildRows(1_000);
const updatedRows = updateEveryNthRow(baseRows);

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
  const benchmarkRoot = root.querySelector('#benchmark-root');

  if (benchmarkRoot) {
    cleanupApp(benchmarkRoot);
  }

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
  try {
    app.mountBenchmarkScenario(baseRows);

    expect(document.querySelectorAll('tbody tr')).toHaveLength(1_000);

    app.setRows(updatedRows);
    flushScheduler();

    expect(
      document.querySelector('tbody tr:first-child td:nth-child(2) a')
        ?.textContent
    ).toBe('Item 1 !!!');
  } finally {
    resetBrowserRoot();
  }
})();

describe('tier4 browser app behaviors', () => {
  let app: BrowserHarness | null = null;
  let rowToggle: BenchToggle<readonly RowData[]> | null = null;

  bench(
    'render and update 1,000 rows in the browser app',
    () => {
      app!.setRows(rowToggle!.next() as RowData[]);
    },
    {
      ...tier4BenchOptions,
      async setup() {
        app = await loadBrowserHarnessWithRoot();
        app.mountBenchmarkScenario(baseRows);
        rowToggle = createRowToggle(baseRows, updatedRows, 'initial');
      },
      teardown() {
        resetBrowserRoot();
        app = null;
        rowToggle = null;
      },
    }
  );

  bench(
    'toggle order-table sorting in the browser app',
    () => {
      const sortButton = document.querySelector<HTMLButtonElement>(
        'button[aria-label="Sort by total"]'
      );

      if (!sortButton) {
        throw new Error('Missing sort button in browser order table scenario.');
      }

      sortButton.click();
      flushScheduler();
    },
    {
      ...tier4BenchOptions,
      async setup() {
        app = await loadBrowserHarnessWithRoot();
        app.mountOrdersScenario();
      },
      teardown() {
        resetBrowserRoot();
        app = null;
      },
    }
  );
});
