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

const tableCreateManyBenchOptions = extendBenchOptions(tier3BenchOptions, {
  time: 4000,
  iterations: 4,
  warmupTime: 500,
  warmupIterations: 1,
});

const rows = buildRows(5000);
const emptyRows: RowData[] = [];

{
  const mounted = mountTableBenchmark();
  try {
    const toggle = createRowToggle(emptyRows, rows, 'initial');

    assertToggleMutationGuard(
      mounted.container,
      () => {
        mounted.benchmark.setRows(toggle.next() as RowData[]);
      },
      () => {
        mounted.benchmark.setRows(toggle.next() as RowData[]);
      },
      {
        label: 'tier3 create many rows',
        afterForward: () => assertRowCountTransition(mounted.container, 5000),
        afterBackward: () => assertRowCountTransition(mounted.container, 0),
      }
    );
  } finally {
    mounted.cleanup();
  }
}

describe('tier3 system table create many', () => {
  let mounted: ReturnType<typeof mountTableBenchmark> | null = null;
  let rowsVisible = false;

  bench(
    'toggle 5,000 table rows between empty and populated',
    () => {
      rowsVisible = !rowsVisible;
      mounted!.benchmark.setRows(rowsVisible ? rows : emptyRows);
    },
    {
      ...tableCreateManyBenchOptions,
      setup() {
        mounted = mountTableBenchmark();
        rowsVisible = false;
      },
      teardown() {
        mounted?.cleanup();
        mounted = null;
      },
    }
  );
});
