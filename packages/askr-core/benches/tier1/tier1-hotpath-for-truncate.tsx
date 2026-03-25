import { bench, describe, expect } from 'vite-plus/test';
import type { BenchToggle, RowData } from '../shared/_shared';
import {
  assertRowCountTransition,
  assertToggleMutationGuard,
  buildRows,
  createRowToggle,
  mountTableBenchmark,
  tier1BenchOptions,
  verifyTier1Invariant,
  withForBenchDiagnostics,
} from '../shared/_shared';

const initialRows = buildRows(1000);
const emptyRows: RowData[] = [];

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
  } finally {
    mounted.cleanup();
  }
});

describe('tier1 hotpath for truncate', () => {
  let mounted: ReturnType<typeof mountTableBenchmark> | null = null;
  let toggle: BenchToggle<readonly RowData[]> | null = null;

  bench(
    'truncate 1,000 keyed rows to empty',
    () => {
      mounted!.benchmark.setRows(toggle!.next() as RowData[]);
    },
    {
      ...tier1BenchOptions,
      setup() {
        mounted = mountTableBenchmark(initialRows);
        toggle = createRowToggle(initialRows, emptyRows, 'initial');
      },
      teardown() {
        mounted?.cleanup();
        mounted = null;
        toggle = null;
      },
    }
  );
});
