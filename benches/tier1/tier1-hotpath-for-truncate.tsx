import { bench, describe, expect } from 'vite-plus/test';
import type { RowData } from '../shared/_shared';
import {
  assertRowCountTransition,
  assertToggleMutationGuard,
  buildRows,
  createRowToggle,
  extendBenchOptions,
  mountTableBenchmark,
  tier1BenchOptions,
  verifyTier1Invariant,
  withForBenchDiagnostics,
} from '../shared/_shared';

const initialRows = buildRows(1000);
const emptyRows: RowData[] = [];
const lifecycleBenchOptions = extendBenchOptions(tier1BenchOptions, {
  time: 12_000,
  iterations: 20,
});

verifyTier1Invariant('tier1 hotpath for truncate', () => {
  const mounted = mountTableBenchmark(initialRows);
  try {
    const toggle = createRowToggle(initialRows, emptyRows, 'initial');
    let metrics!: ReturnType<typeof withForBenchDiagnostics>['metrics'];

    assertToggleMutationGuard(
      mounted.container,
      () => {
        ({ metrics } = withForBenchDiagnostics(() => {
          mounted.benchmark.setRows(toggle.next() as RowData[]);
        }));
      },
      () => {
        mounted.benchmark.setRows(toggle.next() as RowData[]);
      },
      {
        label: 'tier1 truncate rows',
        afterForward: () => assertRowCountTransition(mounted.container, 0),
        afterBackward: () => assertRowCountTransition(mounted.container, 1000),
      }
    );

    expect(metrics.fastLaneName).toBe('TRUNCATE');
    expect(metrics.domNodesCreated).toBe(0);
    expect(metrics.listenerBindings).toBe(0);
    expect(metrics.reactivePropsMounted).toBe(0);
    expect(metrics.replaceChildrenCommits).toBe(0);
    expect(metrics.bulkClearCommits).toBe(1);
  } finally {
    mounted.cleanup();
  }
});

describe('tier1 hotpath for truncate', () => {
  let mounted: ReturnType<typeof mountTableBenchmark> | null = null;

  bench(
    'clear then restore 1,000 keyed rows',
    () => {
      mounted!.benchmark.setRows(emptyRows);
      mounted!.benchmark.setRows(initialRows);
    },
    {
      ...lifecycleBenchOptions,
      setup() {
        mounted = mountTableBenchmark(initialRows);
      },
      teardown() {
        mounted?.cleanup();
        mounted = null;
      },
    }
  );
});
