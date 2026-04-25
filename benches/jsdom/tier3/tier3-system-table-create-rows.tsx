import { bench, describe } from 'vite-plus/test';
import type { BenchToggle, RowData } from '../../shared/_shared';
import {
  assertRowCountTransition,
  assertToggleMutationGuard,
  buildRows,
  createRowToggle,
  mountTableBenchmark,
  noisyTier3BenchOptions,
} from '../../shared/_shared';

const rows = buildRows(1000);
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
        label: 'tier3 create rows',
        afterForward: () => assertRowCountTransition(mounted.container, 1000),
        afterBackward: () => assertRowCountTransition(mounted.container, 0),
      }
    );
  } finally {
    mounted.cleanup();
  }
}

describe('tier3 system table create rows', () => {
  let mounted: ReturnType<typeof mountTableBenchmark> | null = null;
  let toggle: BenchToggle<readonly RowData[]> | null = null;

  bench(
    'create 1,000 table rows',
    () => {
      mounted!.benchmark.setRows(toggle!.next() as RowData[]);
    },
    {
      ...noisyTier3BenchOptions,
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
