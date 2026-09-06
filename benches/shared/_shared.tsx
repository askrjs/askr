import type { Options } from 'tinybench';
import type { JSXElement } from '../../src/jsx/types';
import { cleanupApp } from '../../src/boot';
import { mountBenchmark } from '../../src/bench/benchmark-entry';
import type {
  Route,
  RouteHandler,
  RouteRegistry,
} from '../../src/router/route';
import {
  createRouteRegistry,
  currentRoute,
  route,
} from '../../src/router/route';
import { clearRouteState } from '../../src/router/store';
import { cleanupNavigation } from '../../src/router/navigate';
import { getBenchMetrics } from '../../src/runtime/control/for';
import { renderToString } from '../../src/ssr';
import { getCurrentRenderData, getNextKey } from '../../src/ssr/render-keys';
import type { RouteConfig } from '../../src/ssg/types';
import {
  createTestContainer,
  flushScheduler,
  trackDOMMutations,
} from '../../test-utils/render/test-renderer';

/**
 * Bench tier contracts:
 * - Tier 1: verified internal hot paths and fast lanes.
 * - Tier 2: subsystem behavior and subsystem composition.
 * - Tier 3: canonical benchmark-table system scenarios at realistic scale.
 * - Tier 4: app-level integration workflows only.
 *
 * DOM bench methodology rules:
 * - Timed closures may only do state changes, event dispatch, and flushes.
 * - DOM queries, assertions, and data allocation belong in setup/preflight.
 * - Stateful DOM benches must alternate between concrete A/B states so repeated
 *   iterations cannot collapse into Object.is no-op steady state.
 */

export interface RowData {
  id: number;
  label: string;
}

export interface MountedBenchmark {
  container: HTMLDivElement;
  benchmark: ReturnType<typeof mountBenchmark>;
  cleanup: () => void;
}

export interface HydrationFixture {
  container: HTMLDivElement;
  routes: Route[];
  registry: RouteRegistry;
  reset: () => void;
  cleanup: () => void;
}

export interface DenseRouteTableFixture {
  routes: Route[];
  targetPath: string;
  expectedHandler: RouteHandler;
  expectedParams: Record<string, string>;
}

export interface SsrLayoutRouteFixture {
  url: string;
  routes: Route[];
  registry: RouteRegistry;
  expectedMarker: string;
  shellMarker: string;
}

export interface ConcurrentSsrRequestFixture {
  url: string;
  routes: Route[];
  registry: RouteRegistry;
  options: {
    data: Record<string, unknown>;
  };
  expectedMarker: string;
}

export interface DeferredGeometryController {
  revealAll: () => void;
  restore: () => void;
}

type SsrTreeNode = JSXElement;

type ToggleStart = 'first' | 'second';

export interface BenchToggle<T> {
  current(): T;
  peekNext(): T;
  next(): T;
  reset(start?: ToggleStart): T;
}

export interface CachedElementQuery<T extends Element> {
  getAll(): T[];
  getAt(index: number): T;
  invalidate(): void;
}

export interface DirectionalBenchCycle {
  runForward(): void;
  teardown(): void;
}

export const tier1BenchOptions = {
  time: 400,
  iterations: 5,
  warmupTime: 100,
  warmupIterations: 1,
} satisfies Options;

export const tier2BenchOptions = {
  time: 600,
  iterations: 10,
  warmupTime: 150,
  warmupIterations: 1,
} satisfies Options;

export const tier3BenchOptions = {
  time: 1000,
  iterations: 3,
  warmupTime: 200,
  warmupIterations: 1,
} satisfies Options;

export const tier4BenchOptions = {
  time: 1500,
  iterations: 2,
  warmupTime: 150,
  warmupIterations: 1,
} satisfies Options;

export function extendBenchOptions(
  base: Options,
  overrides: Partial<Options>
): Options {
  return {
    ...base,
    ...overrides,
  };
}

/**
 * Tier 1 benches must verify the internal path they claim to measure before
 * the timed run is considered trustworthy.
 */
export function verifyTier1Invariant(label: string, verify: () => void): void {
  try {
    verify();
  } catch (error) {
    const reason =
      error instanceof Error ? error.message : 'unknown verification failure';
    const symptom = new Error(
      `Tier 1 benchmark verification failed for "${label}": ${reason}`
    ) as Error & { cause?: unknown };
    symptom.cause = error;
    throw symptom;
  }
}

/** Counter contracts are diagnostic-only; DOM preflights always run. */
export function verifyBenchInstrumentation(verify: () => void): void {
  if (process.env.ASKR_BENCH_INSTRUMENTATION === '1') {
    verify();
  }
}

export function buildRows(count: number, startId = 1): RowData[] {
  return Array.from({ length: count }, (_, index) => {
    const id = startId + index;
    return {
      id,
      label: `Item ${id}`,
    };
  });
}

function createAlternatingToggle<T>(
  first: T,
  second: T,
  start: ToggleStart = 'first'
): BenchToggle<T> {
  let currentValue = start === 'first' ? first : second;

  return {
    current() {
      return currentValue;
    },
    peekNext() {
      return Object.is(currentValue, first) ? second : first;
    },
    next() {
      currentValue = Object.is(currentValue, first) ? second : first;
      return currentValue;
    },
    reset(nextStart: ToggleStart = 'first') {
      currentValue = nextStart === 'first' ? first : second;
      return currentValue;
    },
  };
}

export function createRowToggle<T>(
  initialRows: readonly T[],
  nextRows: readonly T[],
  start: 'initial' | 'next' = 'initial'
): BenchToggle<readonly T[]> {
  return createAlternatingToggle(
    initialRows,
    nextRows,
    start === 'initial' ? 'first' : 'second'
  );
}

export function createSelectionToggle<T>(
  first: T,
  second: T,
  start: ToggleStart = 'first'
): BenchToggle<T> {
  return createAlternatingToggle(first, second, start);
}

/**
 * Keeps inverse state restoration outside the timed callback while ensuring
 * every sample begins from the exact same verified state.
 */
export function createDirectionalBenchCycle(options: {
  label: string;
  forward: () => void;
  reset: () => void;
  verifyInitial: () => void;
}): DirectionalBenchCycle {
  let resetPending = false;
  let resetError: unknown = null;

  const surfaceResetFailure = (): void => {
    if (resetError) {
      const error = resetError;
      resetError = null;
      throw error;
    }
    if (resetPending) {
      throw new Error(
        `Directional benchmark reset for "${options.label}" did not finish before the next sample.`
      );
    }
  };

  return {
    runForward() {
      surfaceResetFailure();
      options.forward();
      resetPending = true;
      queueMicrotask(() => {
        try {
          options.reset();
          options.verifyInitial();
        } catch (error) {
          resetError = error;
        } finally {
          resetPending = false;
        }
      });
    },
    teardown() {
      surfaceResetFailure();
      options.verifyInitial();
    },
  };
}

export function createCachedElementQuery<T extends Element = HTMLElement>(
  container: ParentNode,
  selector: string
): CachedElementQuery<T> {
  let cached: T[] | null = null;

  return {
    getAll() {
      if (!cached) {
        cached = Array.from(container.querySelectorAll(selector)) as T[];
      }
      return cached;
    },
    getAt(index: number) {
      const element = this.getAll()[index];
      if (!element) {
        throw new Error(
          `Expected cached query "${selector}" to contain index ${index}.`
        );
      }
      return element;
    },
    invalidate() {
      cached = null;
    },
  };
}

export function updateEveryNthRow(
  rows: readonly RowData[],
  step = 10,
  suffix = ' !!!'
): RowData[] {
  return rows.map((row, index) =>
    index % step === 0 ? { ...row, label: `${row.label}${suffix}` } : row
  );
}

export function removeRowById(rows: readonly RowData[], id: number): RowData[] {
  return rows.filter((row) => row.id !== id);
}

export function reverseRows(rows: readonly RowData[]): RowData[] {
  return rows.slice().reverse();
}

export function shuffleRows(rows: readonly RowData[], seed: number): RowData[] {
  const next = rows.slice();
  let state = seed >>> 0;

  function nextRandom(): number {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x1_0000_0000;
  }

  for (let index = next.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(nextRandom() * (index + 1));
    const current = next[index];
    next[index] = next[swapIndex];
    next[swapIndex] = current;
  }

  return next;
}

export function replaceRowLabelById(
  rows: readonly RowData[],
  id: number,
  nextLabel: string
): RowData[] {
  return rows.map((row) =>
    row.id === id ? { ...row, label: nextLabel } : row
  );
}

export function swapRows(
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

export function replaceAllRows(
  rows: readonly RowData[],
  startId = 10_001
): RowData[] {
  return buildRows(rows.length, startId);
}

function getMutationCount(
  result: ReturnType<typeof trackDOMMutations>
): number {
  return (
    result.addedNodes +
    result.removedNodes +
    result.changedAttributes +
    result.changedText
  );
}

function assertObservedMutation(
  label: string,
  result: ReturnType<typeof trackDOMMutations>
): void {
  if (getMutationCount(result) === 0 && !result.snapshotChanged) {
    throw new Error(`${label} produced no observable DOM mutations.`);
  }
}

export function assertToggleMutationGuard(
  node: Element,
  applyForward: () => void,
  applyBackward: () => void,
  options: {
    label: string;
    afterForward?: () => void;
    afterBackward?: () => void;
  }
): void {
  const forwardMutations = trackDOMMutations(node, applyForward);
  assertObservedMutation(`${options.label} forward`, forwardMutations);
  options.afterForward?.();

  const backwardMutations = trackDOMMutations(node, applyBackward);
  assertObservedMutation(`${options.label} backward`, backwardMutations);
  options.afterBackward?.();
}

export function assertRowCountTransition(
  container: ParentNode,
  expectedCount: number
): void {
  const actualCount = container.querySelectorAll('tr').length;
  if (actualCount !== expectedCount) {
    throw new Error(
      `Expected ${expectedCount} table rows, but found ${actualCount}.`
    );
  }
}

export function assertSelectionTransition(
  container: ParentNode,
  selectedRowIndex: number,
  className = 'danger'
): void {
  const rows = Array.from(container.querySelectorAll('tr'));
  if (!rows[selectedRowIndex]) {
    throw new Error(
      `Expected row index ${selectedRowIndex} to exist for selection check.`
    );
  }

  const selectedRows = rows.filter((row) => row.classList.contains(className));
  if (selectedRows.length !== 1 || selectedRows[0] !== rows[selectedRowIndex]) {
    throw new Error(
      `Expected only row ${selectedRowIndex} to have class "${className}".`
    );
  }
}

export function assertTextTransition(
  container: ParentNode,
  selector: string,
  expectedText: string
): void {
  const element = container.querySelector(selector);
  if (!element) {
    throw new Error(`Expected selector "${selector}" to exist.`);
  }

  if (!element.textContent?.includes(expectedText)) {
    throw new Error(
      `Expected selector "${selector}" to contain "${expectedText}", got "${element.textContent || ''}".`
    );
  }
}

export function assertOrderTransition(
  container: ParentNode,
  expectedIds: readonly number[]
): void {
  const actualIds = Array.from(container.querySelectorAll('tr'), (row) => {
    const idCell = row.querySelector('td');
    return Number(idCell?.textContent ?? Number.NaN);
  });

  if (actualIds.length !== expectedIds.length) {
    throw new Error(
      `Expected ${expectedIds.length} ordered rows, but found ${actualIds.length}.`
    );
  }

  for (let index = 0; index < expectedIds.length; index += 1) {
    if (actualIds[index] !== expectedIds[index]) {
      throw new Error(
        `Expected row order id ${expectedIds[index]} at index ${index}, got ${actualIds[index]}.`
      );
    }
  }
}

export function buildDeepSsrTree(depth = 300): SsrTreeNode {
  let current: SsrTreeNode = <span id={'deep-leaf'}>{'Deep leaf marker'}</span>;

  for (let index = depth - 1; index >= 0; index -= 1) {
    const Tag = (
      index % 3 === 0 ? 'section' : index % 3 === 1 ? 'article' : 'div'
    ) as 'section' | 'article' | 'div';
    current = (
      <Tag id={`deep-level-${index}`} data-depth={String(index)}>
        {current}
      </Tag>
    );
  }

  return <main id={'deep-root'}>{current}</main>;
}

export function buildWideSsrTree(count = 1500) {
  return (
    <section id={'wide-root'} class={'wide-grid'}>
      {Array.from({ length: count }, (_, index) => (
        <article
          id={`wide-card-${index}`}
          class={'wide-card'}
          data-card={String(index)}
        >
          <h2>{`Wide card ${index}`}</h2>
          <p>{`Sibling payload ${index}`}</p>
        </article>
      ))}
    </section>
  );
}

export function buildAttrHeavySsrTree(count = 400) {
  return (
    <section id={'attr-root'} class={'attr-grid'}>
      {Array.from({ length: count }, (_, index) => (
        <div
          id={`attr-node-${index}`}
          class={`attr-card attr-card-${index % 7}`}
          title={`Title ${index} & "quoted" 'single'`}
          role={'listitem'}
          tabIndex={String(index % 5)}
          lang={'en'}
          aria-label={`Label ${index} & "quoted" 'single'`}
          aria-description={`Description ${index} & details`}
          aria-hidden={index % 2 === 0 ? 'false' : 'true'}
          data-index={String(index)}
          data-kind={index % 2 === 0 ? 'primary' : 'secondary'}
          data-message={`Message ${index} & "quoted" 'single'`}
        >{`Attr node ${index}`}</div>
      ))}
    </section>
  );
}

export function buildTextHeavySsrTree(count = 400) {
  return (
    <section id={'text-root'}>
      {Array.from({ length: count }, (_, index) => (
        <p id={`text-block-${index}`}>
          {`Text block ${index} start & `}
          <em>{`em-${index}`}</em>
          {' < '}
          <strong>{`strong-${index}`}</strong>
          {' > '}
          <span>{`segment-${index}`}</span>
          {` tail-${index} & finish`}
        </p>
      ))}
    </section>
  );
}

export function mountTableBenchmark(
  initialRows: RowData[] = []
): MountedBenchmark {
  const { container, cleanup } = createTestContainer();
  const benchmark = mountBenchmark(container, initialRows);
  flushScheduler();

  return {
    container,
    benchmark,
    cleanup() {
      cleanup();
    },
  };
}

export function buildTableHydrationRoutes(
  rows: readonly RowData[],
  path = '/'
): Route[] {
  return [
    {
      path,
      handler: () => (
        <table class={'hydration-table'}>
          <tbody>
            {rows.map((row) => (
              <tr data-key={String(row.id)}>
                <td class={'col-id'}>{String(row.id)}</td>
                <td class={'col-label'}>{row.label}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ),
    },
  ];
}

export function createHydrationFixture({
  routes,
  url = '/',
  mutateServerHtml,
}: {
  routes: Route[];
  url?: string;
  mutateServerHtml?: (container: HTMLDivElement) => void;
}): HydrationFixture {
  const { container, cleanup } = createTestContainer();
  const registry = createRouteRegistry(() => {
    for (const entry of routes) {
      route(
        entry.path,
        entry.handler,
        entry.namespace ? { namespace: entry.namespace } : undefined
      );
    }
  });

  const renderServerHtml = () => {
    setLocationPath(url);
    container.innerHTML = renderToString({ url, registry });
    mutateServerHtml?.(container);
    return container.innerHTML;
  };

  const initialServerHtml = renderServerHtml();

  const reset = () => {
    cleanupApp(container);
    flushScheduler();
    resetRouterState();
    setLocationPath(url);
    container.innerHTML = initialServerHtml;
  };

  return {
    container,
    routes,
    registry,
    reset,
    cleanup() {
      cleanupApp(container);
      resetRouterState();
      cleanup();
    },
  };
}

export function buildSsrLayoutRouteFixture(): SsrLayoutRouteFixture {
  const url = '/dashboard/reports/42?tab=chart#summary';
  const shellMarker = 'Bench Shell';
  const expectedMarker = '42|chart|#summary';

  const ShellLayout = (child: unknown) => (
    <section class={'ssr-shell'}>
      <header>{shellMarker}</header>
      <main>{child}</main>
    </section>
  );

  const SectionLayout = (child: unknown) => (
    <div class={'ssr-section'}>
      <div class={'ssr-body'}>{child}</div>
    </div>
  );

  const routes: Route[] = [
    {
      path: '/dashboard/reports/{id}',
      handler: () => {
        const snapshot = currentRoute();
        return ShellLayout(
          SectionLayout(
            <article
              class={'report-page'}
            >{`${snapshot.params.id}|${snapshot.query.get('tab') || ''}|${snapshot.hash || ''}`}</article>
          )
        );
      },
    },
  ];

  return {
    url,
    shellMarker,
    expectedMarker,
    routes,
    registry: createRouteRegistry(() => {
      for (const entry of routes) route(entry.path, entry.handler);
    }),
  };
}

export function buildConcurrentSsrRequests(
  count = 16
): ConcurrentSsrRequestFixture[] {
  return Array.from({ length: count }, (_, index) => {
    const requestLabel = `request-${index}`;
    const dataLabel = `data-${index}`;
    const url = `/requests/${index}?slot=${index}#frag-${index}`;

    const routes: Route[] = [
      {
        path: '/requests/{id}',
        handler: () => {
          const snapshot = currentRoute();
          const renderData = getCurrentRenderData() as {
            requestLabel?: string;
          } | null;
          const keys = [getNextKey(), getNextKey(), getNextKey()];

          return (
            <div
              class={'concurrent-request'}
              data-request={requestLabel}
            >{`${requestLabel}|${snapshot.path}|${snapshot.params.id}|${
              snapshot.query.get('slot') || ''
            }|${snapshot.hash || ''}|${
              renderData?.requestLabel || ''
            }|${keys.join(',')}`}</div>
          );
        },
      },
    ];

    return {
      url,
      options: {
        data: { requestLabel: dataLabel },
      },
      routes,
      registry: createRouteRegistry(() => {
        for (const entry of routes) route(entry.path, entry.handler);
      }),
      expectedMarker: `${requestLabel}|/requests/${index}|${index}|${index}|#frag-${index}|${dataLabel}|r:0,r:1,r:2`,
    };
  });
}

export function buildStaticBatchRoutes(routeCount = 64): RouteConfig[] {
  const routes: RouteConfig[] = [
    {
      path: '/',
      handler: () => <div id="ssg-home">Static Home</div>,
    },
  ];

  for (let index = 0; index < routeCount - 33; index += 1) {
    routes.push({
      path: `/docs/guides/section-${Math.floor(index / 5)}/page-${index}`,
      handler: () => (
        <article class="docs-page">
          <h1>Docs Page {index}</h1>
          <p>Static docs payload {index}</p>
        </article>
      ),
    });
  }

  for (let index = 0; routes.length < routeCount; index += 1) {
    routes.push({
      path: `/blog/post-${index}`,
      handler: () => (
        <article class="blog-post">
          <h1>Blog post-{index}</h1>
          <p>Generated post {index}</p>
        </article>
      ),
    });
  }

  return routes;
}

export function stubBelowFoldGeometry(
  belowFoldClass = 'below-fold'
): DeferredGeometryController {
  const original = Element.prototype.getBoundingClientRect;
  let revealed = false;

  Element.prototype.getBoundingClientRect = function () {
    const className = (this as Element).className;
    const isBelowFold =
      typeof className === 'string' && className.includes(belowFoldClass);
    const top = isBelowFold && !revealed ? 1000 : 0;

    return {
      top,
      left: 0,
      bottom: top + 100,
      right: 100,
      width: 100,
      height: 100,
      x: 0,
      y: top,
      toJSON: () => undefined,
    } as DOMRect;
  };

  return {
    revealAll() {
      revealed = true;
    },
    restore() {
      Element.prototype.getBoundingClientRect = original;
    },
  };
}

export function setLocationPath(path: string): void {
  if (typeof window === 'undefined') {
    return;
  }

  const normalized = new URL(path, 'http://localhost');
  window.history.pushState(
    { path: normalized.pathname },
    '',
    `${normalized.pathname}${normalized.search}${normalized.hash}`
  );
}

export function resetRouterState(): void {
  clearRouteState();
  cleanupNavigation();
  setLocationPath('/');
}

export function registerBenchRoutes(
  entries: Array<{
    path: string;
    handler: () => unknown;
    namespace?: string;
  }>
): void {
  clearRouteState();
  for (const entry of entries) {
    route(
      entry.path,
      entry.handler,
      entry.namespace ? { namespace: entry.namespace } : undefined
    );
  }
}

export function buildDenseRouteTable(routeCount = 512): DenseRouteTableFixture {
  const targetPath = '/catalog/widgets/pro/42';
  const expectedParams = { id: '42' };
  const expectedHandler: RouteHandler = (params) => (
    <div>{`winner:${params.id}`}</div>
  );
  const noopHandler: RouteHandler = () => <div>{'noop'}</div>;
  const routes: Route[] = [];
  const overlapRoutes: Route[] = [
    { path: '/catalog/widgets/pro/{id}', handler: expectedHandler },
    { path: '/catalog/widgets/{mode}/{id}', handler: noopHandler },
    { path: '/catalog/{section}/{mode}/{id}', handler: noopHandler },
    { path: '/catalog/*/{mode}/{id}', handler: noopHandler },
    { path: '/*', handler: noopHandler },
  ];
  const fillerCount = Math.max(routeCount - overlapRoutes.length, 0);

  for (let index = 0; index < fillerCount; index += 1) {
    const prefix = `/section-${index}`;
    const patternType = index % 4;

    if (patternType === 0) {
      routes.push({
        path: `${prefix}/bucket-${index}/item/{id}`,
        handler: noopHandler,
      });
      continue;
    }

    if (patternType === 1) {
      routes.push({
        path: `${prefix}/{kind}/item/{id}`,
        handler: noopHandler,
      });
      continue;
    }

    if (patternType === 2) {
      routes.push({
        path: `${prefix}/*/item/{id}`,
        handler: noopHandler,
      });
      continue;
    }

    routes.push({
      path: `${prefix}/bucket-${index}/item/detail`,
      handler: noopHandler,
    });
  }

  routes.push(...overlapRoutes);

  return {
    routes,
    targetPath,
    expectedHandler,
    expectedParams,
  };
}

export function withForBenchDiagnostics<T>(run: () => T): {
  result: T;
  metrics: ReturnType<typeof getBenchMetrics>;
} {
  const askrGlobal = globalThis as typeof globalThis & {
    __ASKR_BENCH__?: boolean;
  };
  const previous = askrGlobal.__ASKR_BENCH__;
  askrGlobal.__ASKR_BENCH__ = true;

  try {
    const result = run();
    return {
      result,
      metrics: getBenchMetrics(),
    };
  } finally {
    if (previous === undefined) {
      delete askrGlobal.__ASKR_BENCH__;
    } else {
      askrGlobal.__ASKR_BENCH__ = previous;
    }
  }
}
