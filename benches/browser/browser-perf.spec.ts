import fs from 'node:fs/promises';
import path from 'node:path';
import { expect, test } from '@playwright/test';

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
  | 'browser-input-typing-1k'
  | 'browser-hydrate-1k-table'
  | 'browser-hydrate-interactive-1k';

type InternalBrowserBenchResult = {
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
  benchMetrics: Record<string, unknown>;
  perfMetrics: Record<string, unknown> | null;
};

type BrowserBenchResult = InternalBrowserBenchResult & {
  scriptMs: number;
  layoutMs: number;
  paintMs: number;
};

const BROWSER_BENCH_NAMES: BrowserBenchName[] = [
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

const GATE_THRESHOLDS: Partial<Record<BrowserBenchName, number>> = {
  'browser-state-fanout-1k': 40,
  'browser-update-10th-1k': 50,
  'browser-swap-1k': 45,
  'browser-clear-1k': 25,
  'browser-hydrate-1k-table': 140,
};

function normalizeMetricMap(
  metrics: Array<{ name: string; value: number }>
): Map<string, number> {
  return new Map(metrics.map((metric) => [metric.name, metric.value]));
}

function getMetricDelta(
  before: Map<string, number>,
  after: Map<string, number>,
  name: string
): number {
  return (after.get(name) ?? 0) - (before.get(name) ?? 0);
}

async function captureChromiumDurations(
  page: Parameters<typeof test>[0]['page']
) {
  const session = await page.context().newCDPSession(page);
  await session.send('Performance.enable');

  return {
    async snapshot(): Promise<Map<string, number>> {
      const response = await session.send('Performance.getMetrics');
      return normalizeMetricMap(
        response.metrics as Array<{ name: string; value: number }>
      );
    },
    async dispose(): Promise<void> {
      await session.detach();
    },
  };
}

async function captureHydrationBench(
  page: Parameters<typeof test>[0]['page'],
  name: 'browser-hydrate-1k-table' | 'browser-hydrate-interactive-1k'
): Promise<BrowserBenchResult> {
  const chromiumMetrics = await captureChromiumDurations(page);
  const targetMs = name === 'browser-hydrate-1k-table' ? 140 : 1500;
  const scenario =
    name === 'browser-hydrate-1k-table'
      ? 'server-render and hydrate a 1,000-row benchmark table'
      : 'hydrate a 1,000-row interactive table, select a row, and update a row label';

  await page.goto('/?scenario=hydration-benchmark');
  const before = await chromiumMetrics.snapshot();

  const internal = await page.evaluate(async (benchName) => {
    const rows = Array.from({ length: 1000 }, (_, index) => ({
      id: index + 1,
      label: `Row ${index + 1}`,
    }));

    const start = performance.now();
    await window.__askrPlaywright.mountHydratedBenchmarkTableScenario(rows);
    if (benchName === 'browser-hydrate-interactive-1k') {
      window.__askrPlaywright.setHydratedSelected(rows[499]?.id ?? null);
      window.__askrPlaywright.setHydratedRows(
        rows.map((row, index) =>
          index === 499 ? { ...row, label: `${row.label} hydrated` } : row
        )
      );
    }
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => resolve())
    );
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => resolve())
    );
    const totalMs = performance.now() - start;

    return {
      totalMs,
      actionMs: totalMs,
      framesWaited: 2,
      benchMetrics: window.__askrPlaywright.getBenchMetrics(),
      perfMetrics: window.__askrPlaywright.getPerfMetrics(),
      devCounters: window.__askrPlaywright.getBrowserDevCounters(),
    };
  }, name);

  const after = await chromiumMetrics.snapshot();
  await chromiumMetrics.dispose();

  return {
    name,
    scenario,
    targetMs,
    totalMs: internal.totalMs,
    actionMs: internal.actionMs,
    framesWaited: internal.framesWaited,
    longTasksMs: 0,
    longTaskCount: 0,
    domNodesCreated: Number(internal.benchMetrics.domNodesCreated ?? 0),
    domNodesRemoved: Number(internal.benchMetrics.domRemoves ?? 0),
    textWrites: Math.max(
      Number(internal.devCounters.textNodeWrites ?? 0),
      Number(internal.benchMetrics.domTextSets ?? 0)
    ),
    componentRuns: Number(internal.devCounters.componentRuns ?? 0),
    effectRuns: Number(internal.devCounters.effectRuns ?? 0),
    listenerAdds: Number(internal.devCounters.listenerAdds ?? 0),
    listenerRemoves: Number(internal.devCounters.listenerRemoves ?? 0),
    benchMetrics: internal.benchMetrics,
    perfMetrics: internal.perfMetrics,
    scriptMs: getMetricDelta(before, after, 'ScriptDuration') * 1000,
    layoutMs: getMetricDelta(before, after, 'LayoutDuration') * 1000,
    paintMs: getMetricDelta(before, after, 'PaintDuration') * 1000,
  };
}

test.describe('browser benchmark trends', () => {
  test('should capture JFB-style browser benchmark timings with internal diagnostics', async ({
    page,
  }) => {
    await page.goto('/?scenario=benchmark');

    const chromiumMetrics = await captureChromiumDurations(page);
    const results: BrowserBenchResult[] = [];

    for (const benchName of BROWSER_BENCH_NAMES) {
      const before = await chromiumMetrics.snapshot();
      const internal = await page.evaluate(
        async (name) => window.__askrPlaywright.runBrowserBench(name),
        benchName
      );
      const after = await chromiumMetrics.snapshot();

      results.push({
        ...internal,
        scriptMs: getMetricDelta(before, after, 'ScriptDuration') * 1000,
        layoutMs: getMetricDelta(before, after, 'LayoutDuration') * 1000,
        paintMs: getMetricDelta(before, after, 'PaintDuration') * 1000,
      });
    }

    await chromiumMetrics.dispose();

    results.push(await captureHydrationBench(page, 'browser-hydrate-1k-table'));
    results.push(
      await captureHydrationBench(page, 'browser-hydrate-interactive-1k')
    );

    await fs.mkdir('bench-results', { recursive: true });
    await fs.writeFile(
      path.join('bench-results', 'browser.json'),
      `${JSON.stringify(
        {
          schemaVersion: 2,
          capturedAt: new Date().toISOString(),
          lane: 'browser',
          benches: results.map((result) => ({
            name: result.name,
            scenario: result.scenario,
            targetMs: result.targetMs,
            total: result.totalMs,
            action: result.actionMs,
            script: result.scriptMs,
            layout: result.layoutMs,
            paint: result.paintMs,
            longTasks: result.longTasksMs,
            longTaskCount: result.longTaskCount,
            domNodesCreated: result.domNodesCreated,
            domNodesRemoved: result.domNodesRemoved,
            textWrites: result.textWrites,
            componentRuns: result.componentRuns,
            effectRuns: result.effectRuns,
            listenerAdds: result.listenerAdds,
            listenerRemoves: result.listenerRemoves,
            framesWaited: result.framesWaited,
            benchMetrics: result.benchMetrics,
            perfMetrics: result.perfMetrics,
          })),
        },
        null,
        2
      )}\n`,
      'utf8'
    );

    for (const result of results) {
      expect(result.totalMs).toBeGreaterThanOrEqual(0);
      expect(result.scriptMs).toBeGreaterThanOrEqual(0);
      expect(result.layoutMs).toBeGreaterThanOrEqual(0);
      expect(result.paintMs).toBeGreaterThanOrEqual(0);
      expect(result.longTasksMs).toBeGreaterThanOrEqual(0);
    }

    for (const [benchName, threshold] of Object.entries(
      GATE_THRESHOLDS
    ) as Array<[BrowserBenchName, number]>) {
      const result = results.find((entry) => entry.name === benchName);
      expect(
        result,
        `Missing browser bench result for ${benchName}`
      ).toBeDefined();
      expect(result!.totalMs).toBeLessThanOrEqual(threshold);
    }
  });
});
