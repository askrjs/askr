/** @jsxImportSource @askrjs/askr */

import { state } from '@askrjs/askr';
import { cleanupApp, createIsland, createSPA } from '@askrjs/askr/boot';
import {
  clearRoutes,
  getManifest,
  navigate,
  redirect,
  route,
} from '@askrjs/askr/router';
import { getBenchMetrics, resetBenchMetrics } from '../../../src/runtime/for';
import {
  getPerfMetrics,
  resetPerfMetrics,
} from '../../../src/runtime/perf-metrics';
import {
  getBenchmarkMetadata,
  mountBenchmark,
} from '../../../src/bench/benchmark-entry';

type RowData = {
  id: number;
  label: string;
};

type OperationProfile = {
  durationMs: number;
  benchMetrics: ReturnType<typeof getBenchMetrics>;
  perfMetrics: ReturnType<typeof getPerfMetrics> | null;
};

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Missing Playwright fixture root');
}

const root = rootElement;

(
  globalThis as typeof globalThis & { __ASKR_BENCH__?: boolean }
).__ASKR_BENCH__ = true;

let benchmarkApp: ReturnType<typeof mountBenchmark> | null = null;

function resetRoot(): void {
  cleanupApp(root);
  root.innerHTML = '';
  benchmarkApp = null;
}

function defaultRows(): RowData[] {
  return [
    { id: 1, label: 'Item 1' },
    { id: 2, label: 'Item 2' },
    { id: 3, label: 'Item 3' },
  ];
}

function makeRows(count: number, startId = 1, suffix = ''): RowData[] {
  return Array.from({ length: count }, (_, index) => {
    const id = startId + index;
    return {
      id,
      label: `Row ${id}${suffix}`,
    };
  });
}

function captureOperationProfile(run: () => void): OperationProfile {
  resetBenchMetrics();
  resetPerfMetrics();

  const start = performance.now();
  run();
  const durationMs = performance.now() - start;

  return {
    durationMs,
    benchMetrics: getBenchMetrics(),
    perfMetrics: getPerfMetrics() ?? null,
  };
}

function mountBenchmarkScenario(rows = defaultRows()): void {
  resetRoot();
  root.innerHTML =
    '<h1>Benchmark fixture</h1><section id="benchmark-root" aria-label="Benchmark table"></section>';
  const benchmarkRoot = document.getElementById('benchmark-root');
  if (!benchmarkRoot) {
    throw new Error('Missing benchmark fixture root');
  }
  benchmarkApp = mountBenchmark(benchmarkRoot, rows);
}

function mountInteractionScenario(): void {
  resetRoot();

  const App = () => {
    const view = state('Home');
    const menuOpen = state(false);

    return (
      <section aria-label="Askr interaction fixture">
        <nav aria-label="Fixture navigation">
          <button data-testid="home-link" onClick={() => view.set('Home')}>
            Home
          </button>
          <button
            data-testid="settings-link"
            onClick={() => view.set('Settings')}
          >
            Settings
          </button>
        </nav>
        <h1>{view()}</h1>
        <button
          aria-expanded={String(menuOpen())}
          aria-controls="fixture-menu"
          data-testid="menu-trigger"
          onClick={() => menuOpen.set(!menuOpen())}
        >
          Menu
        </button>
        {menuOpen() ? (
          <div id="fixture-menu" role="menu">
            <button role="menuitem">Profile</button>
            <button role="menuitem">Billing</button>
          </div>
        ) : null}
        <label>
          Search
          <input data-testid="search-input" />
        </label>
      </section>
    );
  };

  createIsland({ root, component: App });
}

async function mountGuardedRouterScenario(): Promise<void> {
  resetRoot();
  clearRoutes();

  route('/', () => (
    <section aria-label="Guarded router fixture">
      <h1>Router Home</h1>
      <button data-testid="private-link" onClick={() => navigate('/private')}>
        Private
      </button>
    </section>
  ));
  route('/login', () => (
    <section aria-label="Login fixture">
      <h1>Login</h1>
      <p data-testid="login-next">{window.location.search}</p>
      <button data-testid="home-link" onClick={() => navigate('/')}>
        Home
      </button>
    </section>
  ));
  route(
    '/private',
    () => (
      <section aria-label="Private fixture">
        <h1>Private</h1>
      </section>
    ),
    {
      policies: [async () => redirect('/login?next=/private')],
    }
  );

  window.history.replaceState({}, '', '/?scenario=guarded');
  await createSPA({ root, manifest: getManifest() });
}

async function runBrowserPerf(): Promise<Record<string, number>> {
  const rows = Array.from({ length: 1000 }, (_, index) => ({
    id: index + 1,
    label: `Row ${index + 1}`,
  }));

  const start = performance.now();
  mountBenchmarkScenario(rows);
  const mountMs = performance.now() - start;

  const updateRows = rows.map((row, index) =>
    index % 10 === 0 ? { ...row, label: `${row.label} updated` } : row
  );
  const updateStart = performance.now();
  benchmarkApp?.setRows(updateRows);
  const updateMs = performance.now() - updateStart;

  const firstInteractionStart = performance.now();
  document.querySelector<HTMLTableRowElement>('tbody tr')?.click();
  const firstInteractionMs = performance.now() - firstInteractionStart;

  return { mountMs, updateMs, firstInteractionMs };
}

function profileBenchmarkOperations() {
  const baseRows = makeRows(1000);
  let currentRows = baseRows;

  const create1k = captureOperationProfile(() => {
    mountBenchmarkScenario(baseRows);
  });

  const update10th1k_x16 = captureOperationProfile(() => {
    for (let iteration = 0; iteration < 16; iteration += 1) {
      currentRows = currentRows.map((row, index) =>
        index % 10 === 0
          ? { ...row, label: `Row ${row.id} update ${iteration + 1}` }
          : row
      );
      benchmarkApp?.setRows(currentRows);
    }
  });

  const swap1k = captureOperationProfile(() => {
    currentRows = currentRows.slice();
    const swapped = currentRows[1];
    currentRows[1] = currentRows[998];
    currentRows[998] = swapped;
    benchmarkApp?.setRows(currentRows);
  });

  const select = captureOperationProfile(() => {
    benchmarkApp?.setSelected(currentRows[499]?.id ?? null);
  });

  const append1k = captureOperationProfile(() => {
    currentRows = currentRows.concat(makeRows(1000, currentRows.length + 1));
    benchmarkApp?.setRows(currentRows);
  });

  const remove1 = captureOperationProfile(() => {
    const removeId = currentRows[499]?.id;
    currentRows = currentRows.filter((row) => row.id !== removeId);
    benchmarkApp?.setRows(currentRows);
  });

  benchmarkApp?.setRows(baseRows);
  currentRows = baseRows;

  const clear1k = captureOperationProfile(() => {
    currentRows = [];
    benchmarkApp?.setRows(currentRows);
  });

  return {
    metadata: getBenchmarkMetadata(),
    operations: {
      create1k,
      update10th1k_x16,
      swap1k,
      select,
      append1k,
      remove1,
      clear1k,
    },
  };
}

const scenario = new URL(window.location.href).searchParams.get('scenario');

if (scenario === 'interaction') {
  mountInteractionScenario();
} else if (scenario === 'guarded') {
  void mountGuardedRouterScenario();
} else {
  mountBenchmarkScenario();
}

Object.assign(window, {
  __askrPlaywright: {
    getBenchmarkMetadata,
    mountBenchmarkScenario,
    mountInteractionScenario,
    mountGuardedRouterScenario,
    profileBenchmarkOperations,
    setRows(rows: RowData[]) {
      benchmarkApp?.setRows(rows);
    },
    async runBrowserPerf() {
      return runBrowserPerf();
    },
  },
});
