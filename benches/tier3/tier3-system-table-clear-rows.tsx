import { bench, describe } from 'vite-plus/test';
import type { RowData } from '../shared/_shared';
import {
  assertRowCountTransition,
  assertToggleMutationGuard,
  buildRows,
  createRowToggle,
  extendBenchOptions,
  mountTableBenchmark,
  tier3BenchOptions,
} from '../shared/_shared';

const tableHeavyBenchOptions = extendBenchOptions(tier3BenchOptions, {
  time: 2500,
  iterations: 4,
  warmupTime: 350,
  warmupIterations: 1,
});

const initialRows = buildRows(1000);
const emptyRows: RowData[] = [];

{
  const mounted = mountTableBenchmark(initialRows);
  try {
    const toggle = createRowToggle(initialRows, emptyRows, 'initial');

    assertToggleMutationGuard(
      mounted.container,
      () => {
        mounted.benchmark.setRows(toggle.next() as RowData[]);
      },
      () => {
        mounted.benchmark.setRows(toggle.next() as RowData[]);
      },
      {
        label: 'tier3 clear rows',
        afterForward: () => assertRowCountTransition(mounted.container, 0),
        afterBackward: () => assertRowCountTransition(mounted.container, 1000),
      }
    );
  } finally {
    mounted.cleanup();
  }
}

describe('tier3 system table clear rows', () => {
  let mounted: ReturnType<typeof mountTableBenchmark> | null = null;
  let rowsVisible = true;

  bench(
    'toggle a 1,000-row table between populated and empty',
    () => {
      rowsVisible = !rowsVisible;
      mounted!.benchmark.setRows(rowsVisible ? initialRows : emptyRows);
    },
    {
      ...tableHeavyBenchOptions,
      setup() {
        mounted = mountTableBenchmark(initialRows);
        rowsVisible = true;
      },
      teardown() {
        mounted?.cleanup();
        mounted = null;
      },
    }
  );
});
