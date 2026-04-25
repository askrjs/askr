/** @jsxImportSource @askrjs/askr */

import { state } from '@askrjs/askr';
import { cleanupApp, createIsland, createSPA } from '@askrjs/askr/boot';
import {
  clearRoutes,
  currentRoute,
  getManifest,
  group,
  lazy,
  navigate,
  registerRoutes,
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
import { mountFormsScenario } from './scenarios/forms';
import { mountHydrationFormScenario } from './scenarios/hydration-form';
import { mountOrderTableScenario } from './scenarios/order-table';
import {
  mountRoutedShellScenario as mountRealRoutedShellScenario,
  shouldMountRoutedShellFromPath,
} from './scenarios/routed-shell';

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

  type FixtureSession = {
    id: string;
  };

  type FixtureUser = {
    name: string;
    roles: string[];
    permissions: string[];
  };

  let session: FixtureSession | null = null;
  let user: FixtureUser | null = null;

  const currentUrl = new URL(window.location.href);
  const lazyShouldFail = currentUrl.searchParams.get('lazy') === 'fail';

  const setViewerSession = () => {
    session = { id: 'viewer-session' };
    user = {
      name: 'Viewer',
      roles: ['viewer'],
      permissions: ['reports:view'],
    };
  };

  const setAdminSession = () => {
    session = { id: 'admin-session' };
    user = {
      name: 'Admin',
      roles: ['admin'],
      permissions: ['reports:view', 'billing:write'],
    };
  };

  const clearSession = () => {
    session = null;
    user = null;
  };

  const auth = {
    resolve: async () => ({ session, user }),
    loginPath: '/login',
    guestRedirectTo: '/private',
    hasRole: (candidate: FixtureUser, role: string) =>
      candidate.roles.includes(role),
    hasPermission: (candidate: FixtureUser, permission: string) =>
      candidate.permissions.includes(permission),
  };

  const knownPaths = new Set([
    '/',
    '/login',
    '/private',
    '/welcome',
    '/reports',
    '/reports/finance',
    '/billing',
    '/lazy-success',
    '/lazy-flaky',
  ]);

  function currentNextTarget(): string {
    return currentRoute().query.get('next') ?? '/private';
  }

  function GuardedShell({ children }: { children?: unknown }) {
    const routeSnapshot = currentRoute();

    return (
      <section aria-label="Guarded router fixture">
        <header>
          <h1>Router Home</h1>
          <p data-testid="auth-status">
            {session && user ? `Signed in as ${user.name}` : 'Signed out'}
          </p>
          <p data-testid="current-path">{routeSnapshot.path}</p>
          <nav aria-label="Guarded navigation">
            <button data-testid="home-link" onClick={() => navigate('/')}>
              Home
            </button>
            <button
              data-testid="private-link"
              onClick={() => navigate('/private')}
            >
              Private
            </button>
            <button
              data-testid="guest-link"
              onClick={() => navigate('/welcome')}
            >
              Welcome
            </button>
            <button
              data-testid="finance-link"
              onClick={() => navigate('/reports/finance')}
            >
              Finance
            </button>
            <button
              data-testid="billing-link"
              onClick={() => navigate('/billing')}
            >
              Billing
            </button>
            <button
              data-testid="lazy-success-link"
              onClick={() => navigate('/lazy-success')}
            >
              Lazy success
            </button>
            <button
              data-testid="lazy-flaky-link"
              onClick={() => navigate('/lazy-flaky')}
            >
              Lazy flaky
            </button>
            {session ? (
              <button
                data-testid="sign-out-link"
                onClick={() => {
                  clearSession();
                  navigate('/');
                }}
              >
                Sign out
              </button>
            ) : null}
          </nav>
        </header>
        <main>{children}</main>
      </section>
    );
  }

  function HomePage() {
    return (
      <section aria-label="Guarded home page">
        <h2>Public landing</h2>
        <p>Choose a route to exercise auth and navigation behavior.</p>
      </section>
    );
  }

  function LoginPage() {
    const nextTarget = currentNextTarget();

    return (
      <section aria-label="Login fixture">
        <h2>Login</h2>
        <p data-testid="login-next-target">{nextTarget}</p>
        <button
          data-testid="sign-in-viewer"
          onClick={() => {
            setViewerSession();
            navigate(nextTarget);
          }}
        >
          Sign in as viewer
        </button>
        <button
          data-testid="sign-in-admin"
          onClick={() => {
            setAdminSession();
            navigate(nextTarget);
          }}
        >
          Sign in as admin
        </button>
      </section>
    );
  }

  function PrivatePage() {
    return (
      <section aria-label="Private fixture">
        <h2>Private overview</h2>
        <p>Only authenticated users can view this page.</p>
      </section>
    );
  }

  function WelcomePage() {
    return (
      <section aria-label="Guest welcome page">
        <h2>Guest welcome</h2>
        <p>This route is only available before sign-in.</p>
      </section>
    );
  }

  function ReportsPage() {
    return (
      <section aria-label="Reports page">
        <h2>Reports</h2>
        <p>Shared reports available to authenticated users.</p>
      </section>
    );
  }

  function FinanceReportPage() {
    return (
      <section aria-label="Finance report page">
        <h2>Finance report</h2>
        <p>Quarterly finance breakdown.</p>
      </section>
    );
  }

  function BillingPage() {
    return (
      <section aria-label="Billing page">
        <h2>Billing settings</h2>
        <p>Manage billing permissions and invoices.</p>
      </section>
    );
  }

  function LazySuccessPage() {
    return (
      <section aria-label="Lazy success page">
        <h2>Lazy success</h2>
        <p>The lazy route loaded successfully.</p>
      </section>
    );
  }

  const lazyFlakyRoute = lazy(() => {
    if (lazyShouldFail) {
      return Promise.reject(new Error('Lazy route failed to load.'));
    }

    return Promise.resolve(() => (
      <section aria-label="Lazy flaky page">
        <h2>Lazy recovery</h2>
        <p>The flaky lazy route recovered after reload.</p>
      </section>
    ));
  });

  registerRoutes(
    () => {
      group({ layout: GuardedShell }, () => {
        route('/', HomePage);
        route('/login', LoginPage);
        route('/private', PrivatePage, { auth: true });
        route('/welcome', WelcomePage, { auth: 'guest' });
        route('/billing', BillingPage, { permission: 'billing:write' });
        route(
          '/lazy-success',
          lazy(() => Promise.resolve(LazySuccessPage)),
          {
            auth: true,
          }
        );
        route('/lazy-flaky', lazyFlakyRoute, { auth: true });

        group({ auth: true }, () => {
          route('/reports', ReportsPage);
          group({ role: 'admin' }, () => {
            route('/reports/finance', FinanceReportPage);
          });
        });
      });
    },
    { auth }
  );

  if (!knownPaths.has(window.location.pathname)) {
    window.history.replaceState({}, '', `/${window.location.search}`);
  }

  await createSPA({ root, manifest: getManifest(), auth });
}

async function mountRoutedShellScenario(): Promise<void> {
  resetRoot();
  await mountRealRoutedShellScenario(root);
}

async function mountCustomerSearchScenario(): Promise<void> {
  resetRoot();

  if (window.location.pathname !== '/customers/search') {
    const query = new URL(window.location.href).searchParams.get('q');
    const search = query ? `?q=${encodeURIComponent(query)}` : '';
    window.history.replaceState({}, '', `/customers/search${search}`);
  }

  await mountRealRoutedShellScenario(root);
}

function mountAccountSettingsScenario(): void {
  resetRoot();
  mountFormsScenario(root);
}

function mountOrdersScenario(): void {
  resetRoot();
  mountOrderTableScenario(root);
}

async function mountSignupHydrationScenario(): Promise<void> {
  resetRoot();
  await mountHydrationFormScenario(root);
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

const currentUrl = new URL(window.location.href);
const scenario = currentUrl.searchParams.get('scenario');
const pathname = currentUrl.pathname;

if (scenario === 'interaction') {
  mountInteractionScenario();
} else if (scenario === 'guarded') {
  void mountGuardedRouterScenario();
} else if (scenario === 'forms') {
  mountAccountSettingsScenario();
} else if (scenario === 'order-table') {
  mountOrdersScenario();
} else if (scenario === 'search-resource') {
  void mountCustomerSearchScenario();
} else if (scenario === 'hydration-form' || pathname === '/signup') {
  void mountSignupHydrationScenario();
} else if (scenario === 'routed-shell') {
  void mountRoutedShellScenario();
} else if (shouldMountRoutedShellFromPath(pathname)) {
  void mountRoutedShellScenario();
} else {
  mountBenchmarkScenario();
}

Object.assign(window, {
  __askrPlaywright: {
    getBenchmarkMetadata,
    mountBenchmarkScenario,
    mountInteractionScenario,
    mountGuardedRouterScenario,
    mountRoutedShellScenario,
    profileBenchmarkOperations,
    setRows(rows: RowData[]) {
      benchmarkApp?.setRows(rows);
    },
    async runBrowserPerf() {
      return runBrowserPerf();
    },
  },
});
