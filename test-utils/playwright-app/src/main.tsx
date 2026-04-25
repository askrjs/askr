import { state } from '@askrjs/askr';
import { cleanupApp, createIsland, createSPA } from '@askrjs/askr/boot';
import {
  clearRoutes,
  getManifest,
  navigate,
  redirect,
  route,
} from '@askrjs/askr/router';
import { mountBenchmark } from '../../../src/bench/benchmark-entry';

type RowData = {
  id: number;
  label: string;
};

const root = document.getElementById('root');

if (!root) {
  throw new Error('Missing Playwright fixture root');
}

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
    mountBenchmarkScenario,
    mountInteractionScenario,
    mountGuardedRouterScenario,
    setRows(rows: RowData[]) {
      benchmarkApp?.setRows(rows);
    },
    async runBrowserPerf() {
      return runBrowserPerf();
    },
  },
});
