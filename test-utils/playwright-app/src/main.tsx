/** @jsxImportSource @askrjs/askr */

import { state } from '@askrjs/askr';
import {
  requireAnonymous,
  requirePermission,
  requireRole,
  requireUser,
} from '@askrjs/auth';
import { ErrorBoundary } from '@askrjs/askr/components';
import { For } from '@askrjs/askr/control';
import {
  cleanupApp,
  createIsland,
  createSPA,
  hydrateSPA,
} from '@askrjs/askr/boot';
import {
  currentRoute,
  createRouteRegistry,
  Link,
  group,
  lazy,
  navigate,
  route,
  updateRouteQuery,
} from '@askrjs/askr/router';
import { renderToString } from '@askrjs/askr/ssr';
import { selector } from '../../../src/runtime/selector';
import { globalScheduler } from '../../../src/runtime/scheduler';
import { getBenchMetrics, resetBenchMetrics } from '../../../src/runtime/for';
import {
  getPerfMetrics,
  resetPerfMetrics,
} from '../../../src/runtime/perf-metrics';
import { getDevValue, setDevValue } from '../../../src/runtime/dev-namespace';
import {
  getBenchmarkMetadata,
  mountBenchmark,
} from '../../../src/bench/benchmark-entry';
import { BenchmarkTable } from '../../../src/bench/components/benchmark-table';
import { mountFormsScenario } from './scenarios/forms';
import { mountHydrationFormScenario } from './scenarios/hydration-form';
import { mountRouteDataDehydrationScenario as mountRouteDataDehydrationFixture } from './scenarios/route-data-dehydration';
import { mountBasePathScenario as mountBasePathFixture } from './scenarios/base-path';
import { mountOrderTableScenario } from './scenarios/order-table';
import {
  mountRoutedShellScenario as mountRealRoutedShellScenario,
  shouldMountRoutedShellFromPath,
} from './scenarios/routed-shell';
import { mountAdjacentForBoundariesScenario as mountAdjacentForBoundariesFixture } from './scenarios/adjacent-for-boundaries';

type RowData = {
  id: number;
  label: string;
};

type FocusReorderRow = { id: number; label: string };

type OperationProfile = {
  durationMs: number;
  benchMetrics: ReturnType<typeof getBenchMetrics>;
  perfMetrics: ReturnType<typeof getPerfMetrics> | null;
};

type BrowserBenchName =
  | 'browser-create-1k'
  | 'browser-replace-1k'
  | 'browser-update-10th-1k'
  | 'browser-select-1k'
  | 'browser-swap-1k'
  | 'browser-remove-one-1k'
  | 'browser-clear-1k'
  | 'browser-create-10k'
  | 'browser-state-fanout-1k'
  | 'browser-large-reactive-tree'
  | 'browser-input-typing-1k';

type BrowserBenchResult = {
  name: BrowserBenchName;
  scenario: string;
  targetMs: number;
  totalMs: number;
  actionMs: number;
  framesWaited: number;
  longTasksMs: number;
  longTaskCount: number;
  domNodesCreated: number;
  domNodesRemoved: number;
  textWrites: number;
  componentRuns: number;
  effectRuns: number;
  listenerAdds: number;
  listenerRemoves: number;
  benchMetrics: ReturnType<typeof getBenchMetrics>;
  perfMetrics: ReturnType<typeof getPerfMetrics> | null;
};

type BrowserDevCounters = {
  componentRuns: number;
  componentReruns: number;
  effectRuns: number;
  listenerAdds: number;
  listenerRemoves: number;
  textNodeWrites: number;
};

type BrowserBenchDefinition = {
  name: BrowserBenchName;
  scenario: string;
  targetMs: number;
  paintSensitive?: boolean;
  setup: () => Promise<void> | void;
  action: () => Promise<void> | void;
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
let focusReorderRows: ReturnType<typeof state<FocusReorderRow[]>> | null = null;
let fanoutState: ReturnType<typeof state<number>> | null = null;
let largeTreeTickState: ReturnType<typeof state<number>> | null = null;
let typingValueState: ReturnType<typeof state<string>> | null = null;
let hydrationRowsSeed: RowData[] = [];
let hydrationRowsState: ReturnType<typeof state<RowData[]>> | null = null;
let hydrationSelectedState: ReturnType<typeof state<number | null>> | null =
  null;
let setErrorBoundaryRecovery: ((next: boolean) => void) | null = null;

const BROWSER_DEV_COUNTER_KEYS = [
  'componentRuns',
  'componentReruns',
  'effectRuns',
  'listenerAdds',
  'listenerRemoves',
  'textNodeWrites',
] as const;

function resetRoot(): void {
  cleanupApp(root);
  root.innerHTML = '';
  benchmarkApp = null;
  setErrorBoundaryRecovery = null;
}

function defaultRows(): RowData[] {
  return [
    { id: 1, label: 'Item 1' },
    { id: 2, label: 'Item 2' },
    { id: 3, label: 'Item 3' },
  ];
}

function nextAnimationFrame(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => resolve());
  });
}

async function waitForAnimationFrames(count: number): Promise<void> {
  for (let index = 0; index < count; index += 1) {
    await nextAnimationFrame();
  }
}

function resetBrowserDevCounters(): void {
  for (const key of BROWSER_DEV_COUNTER_KEYS) {
    setDevValue(key, 0);
  }
}

function getBrowserDevCounters(): BrowserDevCounters {
  return {
    componentRuns: getBrowserDevCounter('componentRuns'),
    componentReruns: getBrowserDevCounter('componentReruns'),
    effectRuns: getBrowserDevCounter('effectRuns'),
    listenerAdds: getBrowserDevCounter('listenerAdds'),
    listenerRemoves: getBrowserDevCounter('listenerRemoves'),
    textNodeWrites: getBrowserDevCounter('textNodeWrites'),
  };
}

function captureDuration(run: () => void): number {
  const start = performance.now();
  run();
  return performance.now() - start;
}

function getBrowserDevCounter(
  key: (typeof BROWSER_DEV_COUNTER_KEYS)[number]
): number {
  const value = getDevValue<number>(key);
  return typeof value === 'number' ? value : 0;
}

function replaceRows(rows: readonly RowData[], startId = 10_001): RowData[] {
  return makeRows(rows.length, startId, ' replacement');
}

function updateEvery10thRow(
  rows: readonly RowData[],
  suffix: string
): RowData[] {
  return rows.map((row, index) =>
    index % 10 === 0 ? { ...row, label: `${row.label}${suffix}` } : row
  );
}

function swapRows(
  rows: readonly RowData[],
  leftIndex: number,
  rightIndex: number
): RowData[] {
  const next = rows.slice();
  const temp = next[leftIndex];
  next[leftIndex] = next[rightIndex];
  next[rightIndex] = temp;
  return next;
}

function mountStateFanoutScenario(): void {
  resetRoot();

  const App = () => {
    fanoutState = state(0);

    return (
      <div>
        {Array.from({ length: 1000 }, (_, index) => (
          <span data-i={index}>
            {fanoutState!()}-{index}
          </span>
        ))}
      </div>
    );
  };

  createIsland({ root, component: App });
  globalScheduler.flush();
}

function mountLargeReactiveTreeScenario(): void {
  resetRoot();

  const App = () => {
    largeTreeTickState = state(0);

    return (
      <div>
        {Array.from({ length: 1000 }, (_, index) => (
          <span data-i={index}>
            {index}:{largeTreeTickState!()}
          </span>
        ))}
      </div>
    );
  };

  createIsland({ root, component: App });
  globalScheduler.flush();
}

function mountInputTypingScenario(): void {
  resetRoot();

  const App = () => {
    typingValueState = state('');

    return (
      <section aria-label="Browser typing benchmark">
        <label>
          Search
          <input
            data-testid="typing-input"
            type="text"
            value={typingValueState()}
            onInput={(event: Event) =>
              typingValueState!.set((event.target as HTMLInputElement).value)
            }
          />
        </label>
        <div>
          {Array.from({ length: 1000 }, (_, index) => (
            <span data-i={index}>
              {typingValueState() || 'empty'}-{index}
            </span>
          ))}
        </div>
      </section>
    );
  };

  createIsland({ root, component: App });
  globalScheduler.flush();
}

function HydrationBenchmarkPage() {
  hydrationRowsState = state<RowData[]>(hydrationRowsSeed);
  hydrationSelectedState = state<number | null>(null);
  hydrationRowsState._hasBeenRead = true;
  const isSelected = selector(hydrationSelectedState);

  const select = (id: number) => hydrationSelectedState!.set(id);
  const remove = (id: number) => {
    hydrationRowsState!.set((rows) => rows.filter((item) => item.id !== id));
    hydrationSelectedState!.set((selected) =>
      selected === id ? null : selected
    );
  };

  return (
    <div class="container">
      <BenchmarkTable
        rows={hydrationRowsState}
        isSelected={isSelected}
        onSelect={select}
        onRemove={remove}
      />
    </div>
  );
}

async function mountHydratedBenchmarkTableScenario(
  rows: RowData[]
): Promise<void> {
  resetRoot();
  hydrationRowsSeed = rows;
  hydrationRowsState = null;
  hydrationSelectedState = null;

  const registry = createRouteRegistry(() => {
    route('/benchmark-hydrate', HydrationBenchmarkPage);
  });

  if (window.location.pathname !== '/benchmark-hydrate') {
    window.history.replaceState({}, '', '/benchmark-hydrate');
  }

  root.innerHTML = renderToString({
    url: `${window.location.pathname}${window.location.search}`,
    registry,
  });

  await hydrateSPA({ root, registry });
  globalScheduler.flush();
}

function StaticQueryDeepLinkPage() {
  const snapshot = currentRoute();
  return (
    <p>{`${snapshot.query.get('q') ?? ''}|${snapshot.query.get('page') ?? '1'}|${snapshot.hash ?? ''}`}</p>
  );
}

async function mountStaticQueryDeepLinkScenario(): Promise<{
  preserved: boolean;
  text: string;
  updatedText: string;
}> {
  resetRoot();
  const registry = createRouteRegistry(
    () => route('/search', StaticQueryDeepLinkPage),
    { basePath: '/website' }
  );
  window.history.replaceState({}, '', '/website/search/');
  root.innerHTML = renderToString({
    url: '/website/search/',
    registry,
  });
  const paragraph = root.querySelector('p');
  window.history.replaceState({}, '', '/website/search/?q=pig&page=2#results');

  await hydrateSPA({
    root,
    registry,
    hydrate: { verifyMarkup: true },
  });
  globalScheduler.flush();

  const text = root.querySelector('p')?.textContent ?? '';
  updateRouteQuery({ q: 'owl', page: 3 });
  globalScheduler.flush();

  return {
    preserved: root.querySelector('p') === paragraph,
    text,
    updatedText: root.querySelector('p')?.textContent ?? '',
  };
}

function setHydratedRows(rows: RowData[]): void {
  hydrationRowsState?.set(rows);
  globalScheduler.flush();
}

function setHydratedSelected(id: number | null): void {
  hydrationSelectedState?.set(id);
  globalScheduler.flush();
}

function setRows(rows: RowData[]): void {
  benchmarkApp?.setRows(rows);
}

async function captureBrowserBench(
  definition: BrowserBenchDefinition
): Promise<BrowserBenchResult> {
  resetRoot();
  await definition.setup();
  await waitForAnimationFrames(1);

  resetBenchMetrics();
  resetPerfMetrics();
  resetBrowserDevCounters();

  const totalStartMark = `${definition.name}:total:start`;
  const totalEndMark = `${definition.name}:total:end`;
  const totalMeasureName = `${definition.name}:total`;
  const actionStartMark = `${definition.name}:action:start`;
  const actionEndMark = `${definition.name}:action:end`;
  const actionMeasureName = `${definition.name}:action`;

  performance.clearMarks(totalStartMark);
  performance.clearMarks(totalEndMark);
  performance.clearMarks(actionStartMark);
  performance.clearMarks(actionEndMark);
  performance.clearMeasures(totalMeasureName);
  performance.clearMeasures(actionMeasureName);

  let longTasksMs = 0;
  let longTaskCount = 0;
  let observer: PerformanceObserver | null = null;

  if (
    typeof PerformanceObserver !== 'undefined' &&
    PerformanceObserver.supportedEntryTypes?.includes('longtask')
  ) {
    observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        longTaskCount += 1;
        longTasksMs += entry.duration;
      }
    });
    observer.observe({ entryTypes: ['longtask'] });
  }

  performance.mark(totalStartMark);
  performance.mark(actionStartMark);
  await definition.action();
  performance.mark(actionEndMark);
  performance.measure(actionMeasureName, actionStartMark, actionEndMark);

  const framesWaited = definition.paintSensitive ? 2 : 1;
  await waitForAnimationFrames(framesWaited);

  performance.mark(totalEndMark);
  performance.measure(totalMeasureName, totalStartMark, totalEndMark);
  observer?.disconnect();

  const actionMs =
    performance.getEntriesByName(actionMeasureName).at(-1)?.duration ?? 0;
  const totalMs =
    performance.getEntriesByName(totalMeasureName).at(-1)?.duration ?? 0;
  const benchMetrics = getBenchMetrics();
  const perfMetrics = getPerfMetrics() ?? null;
  const textWrites = Math.max(
    getBrowserDevCounter('textNodeWrites'),
    benchMetrics.domTextSets
  );

  const result: BrowserBenchResult = {
    name: definition.name,
    scenario: definition.scenario,
    targetMs: definition.targetMs,
    totalMs,
    actionMs,
    framesWaited,
    longTasksMs,
    longTaskCount,
    domNodesCreated: benchMetrics.domNodesCreated,
    domNodesRemoved: benchMetrics.domRemoves,
    textWrites,
    componentRuns: getBrowserDevCounter('componentRuns'),
    effectRuns: getBrowserDevCounter('effectRuns'),
    listenerAdds: getBrowserDevCounter('listenerAdds'),
    listenerRemoves: getBrowserDevCounter('listenerRemoves'),
    benchMetrics,
    perfMetrics,
  };

  resetRoot();
  return result;
}

function getBrowserBenchDefinition(
  name: BrowserBenchName
): BrowserBenchDefinition {
  const baseRows = makeRows(1000);

  switch (name) {
    case 'browser-create-1k':
      return {
        name,
        scenario: 'create 1,000 keyed rows in the browser benchmark table',
        targetMs: 80,
        paintSensitive: true,
        setup: () => {
          mountBenchmarkScenario([]);
        },
        action: () => {
          benchmarkApp?.setRows(baseRows);
        },
      };
    case 'browser-replace-1k':
      return {
        name,
        scenario: 'replace 1,000 keyed rows with a fresh keyed dataset',
        targetMs: 80,
        paintSensitive: true,
        setup: () => {
          mountBenchmarkScenario(baseRows);
        },
        action: () => {
          benchmarkApp?.setRows(replaceRows(baseRows));
        },
      };
    case 'browser-update-10th-1k':
      return {
        name,
        scenario: 'update every 10th keyed row without reordering keys',
        targetMs: 40,
        paintSensitive: true,
        setup: () => {
          mountBenchmarkScenario(baseRows);
        },
        action: () => {
          benchmarkApp?.setRows(updateEvery10thRow(baseRows, ' updated'));
        },
      };
    case 'browser-select-1k':
      return {
        name,
        scenario: 'select one row in a 1,000-row keyed table',
        targetMs: 10,
        setup: () => {
          mountBenchmarkScenario(baseRows);
        },
        action: () => {
          benchmarkApp?.setSelected(baseRows[499]?.id ?? null);
        },
      };
    case 'browser-swap-1k':
      return {
        name,
        scenario: 'swap two distant keyed rows',
        targetMs: 45,
        paintSensitive: true,
        setup: () => {
          mountBenchmarkScenario(baseRows);
        },
        action: () => {
          benchmarkApp?.setRows(swapRows(baseRows, 1, 998));
        },
      };
    case 'browser-remove-one-1k':
      return {
        name,
        scenario: 'remove one keyed row from the middle of a 1,000-row table',
        targetMs: 40,
        paintSensitive: true,
        setup: () => {
          mountBenchmarkScenario(baseRows);
        },
        action: () => {
          const removeId = baseRows[499]?.id;
          benchmarkApp?.setRows(baseRows.filter((row) => row.id !== removeId));
        },
      };
    case 'browser-clear-1k':
      return {
        name,
        scenario: 'clear 1,000 keyed rows',
        targetMs: 20,
        paintSensitive: true,
        setup: () => {
          mountBenchmarkScenario(baseRows);
        },
        action: () => {
          benchmarkApp?.setRows([]);
        },
      };
    case 'browser-create-10k':
      return {
        name,
        scenario: 'create 10,000 keyed rows',
        targetMs: 700,
        paintSensitive: true,
        setup: () => {
          mountBenchmarkScenario([]);
        },
        action: () => {
          benchmarkApp?.setRows(makeRows(10_000));
        },
      };
    case 'browser-state-fanout-1k':
      return {
        name,
        scenario:
          'propagate one state write to 1,000 sibling spans in the browser',
        targetMs: 40,
        paintSensitive: true,
        setup: () => {
          mountStateFanoutScenario();
        },
        action: () => {
          fanoutState?.set(1);
          globalScheduler.flush();
        },
      };
    case 'browser-large-reactive-tree':
      return {
        name,
        scenario: 'update a 1,000-node reactive span tree in the browser',
        targetMs: 25,
        paintSensitive: true,
        setup: () => {
          mountLargeReactiveTreeScenario();
        },
        action: () => {
          largeTreeTickState?.set(1);
          globalScheduler.flush();
        },
      };
    case 'browser-input-typing-1k':
      return {
        name,
        scenario:
          'type into a controlled input while 1,000 derived text nodes are mounted',
        targetMs: 8,
        paintSensitive: true,
        setup: () => {
          mountInputTypingScenario();
        },
        action: async () => {
          const input = root.querySelector<HTMLInputElement>(
            '[data-testid="typing-input"]'
          );
          if (!input) {
            throw new Error('Missing typing benchmark input.');
          }

          const samples = ['a', 'ab', 'abc', 'abcd', 'abcde'];
          let totalDuration = 0;

          for (const sample of samples) {
            totalDuration += captureDuration(() => {
              input.value = sample;
              input.dispatchEvent(
                new InputEvent('input', {
                  bubbles: true,
                  data: sample.at(-1) ?? '',
                  inputType: 'insertText',
                })
              );
              globalScheduler.flush();
            });
          }

          setDevValue(
            '__ASKR_BROWSER_TYPING_AVG_MS',
            totalDuration / samples.length
          );
        },
      };
  }
}

async function runBrowserBench(
  name: BrowserBenchName
): Promise<BrowserBenchResult> {
  const result = await captureBrowserBench(getBrowserBenchDefinition(name));

  if (name === 'browser-input-typing-1k') {
    const averageDuration =
      getDevValue<number>('__ASKR_BROWSER_TYPING_AVG_MS') ?? 0;
    result.totalMs = averageDuration;
  }

  return result;
}

async function runBrowserBenchSuite(): Promise<BrowserBenchResult[]> {
  const benchNames: BrowserBenchName[] = [
    'browser-create-1k',
    'browser-replace-1k',
    'browser-update-10th-1k',
    'browser-select-1k',
    'browser-swap-1k',
    'browser-remove-one-1k',
    'browser-clear-1k',
    'browser-create-10k',
    'browser-state-fanout-1k',
    'browser-large-reactive-tree',
    'browser-input-typing-1k',
  ];

  const results: BrowserBenchResult[] = [];
  for (const name of benchNames) {
    results.push(await runBrowserBench(name));
  }

  return results;
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

function FocusReorderItem({
  item,
  index,
}: {
  item: FocusReorderRow;
  index: () => number;
}) {
  const [localCount, setLocalCount] = state(0);
  const [frameworkInputCount, setFrameworkInputCount] = state(0);

  return (
    <article data-focus-row={String(item.id)} data-index={String(index())}>
      <span>{item.label}</span>
      <input
        aria-label={`Retained input ${item.id}`}
        onInput={() => setFrameworkInputCount((count) => count + 1)}
      />
      <output data-framework-count>{String(frameworkInputCount())}</output>
      <button type="button" onClick={() => setLocalCount((count) => count + 1)}>
        Local count {localCount()}
      </button>
    </article>
  );
}

function mountFocusReorderScenario(count: number): void {
  resetRoot();
  const initialRows = Array.from({ length: count }, (_, index) => ({
    id: index + 1,
    label: `Focus row ${index + 1}`,
  }));

  const App = () => {
    focusReorderRows = state(initialRows);
    return (
      <section aria-label="Retained focus reorder">
        <For each={() => focusReorderRows!()} by={(item) => item.id}>
          {(item, index) => <FocusReorderItem item={item} index={index} />}
        </For>
      </section>
    );
  };

  createIsland({ root, component: App });
}

function reorderFocusRows(
  mode: 'reverse' | 'reverse-fresh' | 'sparse-front' | 'delete' | 'truncate',
  focusedId?: number
): void {
  if (!focusReorderRows)
    throw new Error('Focus reorder scenario is not mounted');
  const current = focusReorderRows();
  if (mode === 'delete') {
    focusReorderRows.set(current.filter((row) => row.id !== focusedId));
    return;
  }
  if (mode === 'truncate') {
    focusReorderRows.set(current.slice(0, focusedId));
    return;
  }
  if (mode === 'sparse-front') {
    focusReorderRows.set([
      current[current.length - 1]!,
      ...current.slice(0, -1),
    ]);
    return;
  }
  const reversed = current.slice().reverse();
  focusReorderRows.set(
    mode === 'reverse-fresh' ? reversed.map((row) => ({ ...row })) : reversed
  );
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

async function mountNavLinkForScenario(): Promise<void> {
  resetRoot();
  const navItems = [
    { href: '/dashboard', label: 'Dashboard' },
    { href: '/customers/search', label: 'Customers' },
    { href: '/settings', label: 'Settings' },
  ];

  const NavLinkLike = (props: { href: string; label: string }) => {
    const route = currentRoute();
    const isActive = route.path === props.href;

    return (
      <Link
        href={props.href}
        aria-current={isActive ? 'page' : undefined}
        data-active={isActive ? 'true' : undefined}
      >
        {props.label}
      </Link>
    );
  };

  const App = () => {
    const route = currentRoute();

    return (
      <section aria-label="NavLink For fixture">
        <h1>Route: {route.path}</h1>
        <nav aria-label="Primary navigation">
          <For each={() => navItems} by={(item) => item.href}>
            {(item) => <NavLinkLike href={item.href} label={item.label} />}
          </For>
        </nav>
      </section>
    );
  };

  const registry = createRouteRegistry(() => {
    group({ layout: App }, () => {
      route('/dashboard', () => <></>);
      route('/customers/search', () => <></>);
      route('/settings', () => <></>);
    });
  });

  if (window.location.pathname !== '/dashboard') {
    window.history.replaceState({}, '', '/dashboard');
  }

  await createSPA({ root, registry });
}

function mountErrorBoundaryScenario(): void {
  resetRoot();

  const Crash = () => {
    throw new Error('fixture crash');
  };

  const App = () => {
    const recover = state(false);
    setErrorBoundaryRecovery = recover.set;

    return (
      <section aria-label="Error boundary fixture">
        <button data-testid="recover" onClick={() => recover.set(true)}>
          Recover
        </button>
        <ErrorBoundary
          resetKey={recover()}
          fallback={(error, _reset) => (
            <div data-testid="boundary-fallback">
              <p data-testid="boundary-message">
                {error instanceof Error ? error.message : String(error)}
              </p>
              <button
                data-testid="retry"
                onClick={() => {
                  setErrorBoundaryRecovery?.(true);
                }}
              >
                Retry
              </button>
            </div>
          )}
        >
          {recover() ? <p data-testid="safe-content">Recovered</p> : <Crash />}
        </ErrorBoundary>
      </section>
    );
  };

  createIsland({ root, component: App });
  globalScheduler.flush();
}

async function mountGuardedRouterScenario(): Promise<void> {
  resetRoot();

  type FixtureSession = {
    id: string;
    subject: string;
  };

  type FixtureUser = {
    id: string;
    name: string;
    roles: string[];
    permissions: string[];
  };

  let session: FixtureSession | null = null;
  let user: FixtureUser | null = null;

  const currentUrl = new URL(window.location.href);
  const lazyShouldFail = currentUrl.searchParams.get('lazy') === 'fail';

  const setViewerSession = () => {
    session = { id: 'viewer-session', subject: 'viewer' };
    user = {
      id: 'viewer',
      name: 'Viewer',
      roles: ['viewer'],
      permissions: ['reports:view'],
    };
  };

  const setAdminSession = () => {
    session = { id: 'admin-session', subject: 'admin' };
    user = {
      id: 'admin',
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
    resolve: async () => ({
      authenticated: session !== null && user !== null,
      principal: user,
      session,
      tenant: null,
    }),
    loginPath: '/login',
    authenticatedRedirectTo: '/private',
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

  const registry = createRouteRegistry(
    () => {
      group({ layout: GuardedShell }, () => {
        route('/', HomePage);
        route('/login', LoginPage);
        route('/private', PrivatePage, { auth: requireUser() });
        route('/welcome', WelcomePage, { auth: requireAnonymous() });
        route('/billing', BillingPage, {
          auth: requirePermission('billing:write'),
        });
        route(
          '/lazy-success',
          lazy(() => Promise.resolve(LazySuccessPage)),
          {
            auth: requireUser(),
          }
        );
        route('/lazy-flaky', lazyFlakyRoute, { auth: requireUser() });

        group({ auth: requireUser() }, () => {
          route('/reports', ReportsPage);
          group({ auth: requireRole('admin') }, () => {
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

  await createSPA({ root, registry, auth });
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

async function mountRouteDataDehydrationScenario(): Promise<void> {
  resetRoot();
  await mountRouteDataDehydrationFixture(root);
}

async function mountBasePathScenario(): Promise<void> {
  resetRoot();
  await mountBasePathFixture(root);
}

function mountAdjacentForBoundariesScenario(): void {
  resetRoot();
  mountAdjacentForBoundariesFixture(root);
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
const autoStartEnabled =
  (
    globalThis as typeof globalThis & {
      __ASKR_BROWSER_AUTOSTART__?: boolean;
    }
  ).__ASKR_BROWSER_AUTOSTART__ !== false;

if (autoStartEnabled) {
  if (scenario === 'interaction') {
    mountInteractionScenario();
  } else if (scenario === 'guarded') {
    void mountGuardedRouterScenario();
  } else if (scenario === 'error-boundary') {
    mountErrorBoundaryScenario();
  } else if (scenario === 'forms') {
    mountAccountSettingsScenario();
  } else if (scenario === 'order-table') {
    mountOrdersScenario();
  } else if (scenario === 'search-resource') {
    void mountCustomerSearchScenario();
  } else if (scenario === 'hydration-benchmark') {
    resetRoot();
  } else if (scenario === 'hydration-form' || pathname === '/signup') {
    void mountSignupHydrationScenario();
  } else if (scenario === 'routed-shell') {
    void mountRoutedShellScenario();
  } else if (scenario === 'navlink-for') {
    void mountNavLinkForScenario();
  } else if (shouldMountRoutedShellFromPath(pathname)) {
    void mountRoutedShellScenario();
  } else {
    mountBenchmarkScenario();
  }
}

Object.assign(window, {
  __askrPlaywright: {
    getBenchmarkMetadata,
    getBenchMetrics,
    getPerfMetrics,
    getBrowserDevCounters,
    mountBenchmarkScenario,
    mountFocusReorderScenario,
    mountHydratedBenchmarkTableScenario,
    mountInteractionScenario,
    mountGuardedRouterScenario,
    mountRoutedShellScenario,
    mountRouteDataDehydrationScenario,
    mountBasePathScenario,
    mountNavLinkForScenario,
    mountAdjacentForBoundariesScenario,
    profileBenchmarkOperations,
    runBrowserBench,
    runBrowserBenchSuite,
    setHydratedRows,
    setHydratedSelected,
    setRows,
    reorderFocusRows,
    async runBrowserPerf() {
      return runBrowserPerf();
    },
  },
});

export {
  getBenchmarkMetadata,
  getBenchMetrics,
  getPerfMetrics,
  getBrowserDevCounters,
  mountBenchmarkScenario,
  mountFocusReorderScenario,
  mountAccountSettingsScenario,
  mountCustomerSearchScenario,
  mountErrorBoundaryScenario,
  mountGuardedRouterScenario,
  mountHydratedBenchmarkTableScenario,
  mountStaticQueryDeepLinkScenario,
  mountInteractionScenario,
  mountNavLinkForScenario,
  mountAdjacentForBoundariesScenario,
  mountOrdersScenario,
  mountRoutedShellScenario,
  mountRouteDataDehydrationScenario,
  mountBasePathScenario,
  mountSignupHydrationScenario,
  profileBenchmarkOperations,
  runBrowserBench,
  runBrowserBenchSuite,
  runBrowserPerf,
  setHydratedRows,
  setHydratedSelected,
  setRows,
  reorderFocusRows,
};
