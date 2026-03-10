import { bench, describe } from 'vitest';
import type { BenchToggle, RowData } from '../shared/_shared';
import {
  assertRowCountTransition,
  assertToggleMutationGuard,
  buildRows,
  createRowToggle,
  mountTableBenchmark,
  tier3BenchOptions,
} from '../shared/_shared';

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
  let toggle: BenchToggle<readonly RowData[]> | null = null;

  bench(
    'create 5,000 table rows',
    () => {
      mounted!.benchmark.setRows(toggle!.next() as RowData[]);
    },
    {
      ...tier3BenchOptions,
      setup() {
        mounted = mountTableBenchmark();
        toggle = createRowToggle(emptyRows, rows, 'initial');
      },
      teardown() {
        mounted?.cleanup();
        mounted = null;
        toggle = null;
      },
    }
  );
});
