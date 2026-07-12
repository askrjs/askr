import { bench, describe, expect, vi } from 'vite-plus/test';
import { cleanupApp } from '../../src/boot';
import { loadBrowserHarness } from '../../tests/browser/_helpers';
import { flushScheduler } from '../../test-utils/render/test-renderer';
import { extendBenchOptions, tier4BenchOptions } from '../shared/_shared';

type BrowserHarness = Awaited<ReturnType<typeof loadBrowserHarness>>;

const orderTableRetentionBenchOptions = extendBenchOptions(tier4BenchOptions, {
  time: 2200,
  iterations: 3,
  warmupTime: 250,
  warmupIterations: 1,
});

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

function findButtonByText(text: string): HTMLButtonElement {
  const button = Array.from(document.querySelectorAll('button')).find(
    (candidate) => candidate.textContent?.trim() === text
  ) as HTMLButtonElement | undefined;

  if (!button) {
    throw new Error(`Missing button with text "${text}".`);
  }

  return button;
}

function findSortButton(): HTMLButtonElement {
  const button = document.querySelector<HTMLButtonElement>(
    'button[aria-label="Sort by total"]'
  );

  if (!button) {
    throw new Error('Missing sort button in browser order table scenario.');
  }

  return button;
}

function findLabeledInput(labelText: string): HTMLInputElement {
  const label = Array.from(document.querySelectorAll('label')).find((node) =>
    node.textContent?.includes(labelText)
  ) as HTMLLabelElement | undefined;

  const input = label?.querySelector('input');

  if (!input) {
    throw new Error(`Missing input for label "${labelText}".`);
  }

  return input as HTMLInputElement;
}

function dirtyOrderTableState(): void {
  findButtonByText('Select order 1002').click();
  flushScheduler();

  const noteInput = findLabeledInput('Note for order 1002');
  noteInput.value = 'Call billing';
  noteInput.dispatchEvent(new Event('input', { bubbles: true }));
  flushScheduler();

  findSortButton().click();
  flushScheduler();
}

await (async () => {
  const app = await loadBrowserHarnessWithRoot();
  const root = document.getElementById('root') as HTMLDivElement;

  try {
    app.mountOrdersScenario();
    flushScheduler();
    dirtyOrderTableState();

    cleanupApp(root);
    flushScheduler();
    root.innerHTML = '';

    app.mountOrdersScenario();
    flushScheduler();

    expect(findLabeledInput('Note for order 1002')).toHaveValue('Paid by card');
    expect(document.querySelector('[aria-selected="true"]')).toBeNull();
    expect(findSortButton()).toHaveTextContent('Sort by total descending');
  } finally {
    resetBrowserRoot();
  }
})();

describe('tier4 integration order table retention', () => {
  let app: BrowserHarness | null = null;
  let root: HTMLDivElement | null = null;

  bench(
    'mount, dirty, tear down, and remount the orders app',
    () => {
      cleanupApp(root!);
      flushScheduler();
      root!.innerHTML = '';

      app!.mountOrdersScenario();
      flushScheduler();

      expect(findLabeledInput('Note for order 1002')).toHaveValue(
        'Paid by card'
      );
      expect(document.querySelector('[aria-selected="true"]')).toBeNull();
      expect(findSortButton()).toHaveTextContent('Sort by total descending');
    },
    {
      ...orderTableRetentionBenchOptions,
      async setup() {
        root = ensureBrowserRoot();
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
