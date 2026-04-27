import { bench, describe } from 'vite-plus/test';
import type { RowData } from '../../shared/_shared';
import {
  assertRowCountTransition,
  assertToggleMutationGuard,
  buildRows,
  createRowToggle,
  mountTableBenchmark,
  noisyTier3BenchOptions,
} from '../../shared/_shared';

const initialRows = buildRows(1000);
const appendedRows = buildRows(2000);

{
  const mounted = mountTableBenchmark(initialRows);
  try {
    const toggle = createRowToggle(initialRows, appendedRows, 'initial');

    assertToggleMutationGuard(
      mounted.container,
      () => {
        mounted.benchmark.setRows(toggle.next() as RowData[]);
      },
      () => {
        mounted.benchmark.setRows(toggle.next() as RowData[]);
      },
      {
        label: 'tier3 append rows',
        afterForward: () => assertRowCountTransition(mounted.container, 2000),
        afterBackward: () => assertRowCountTransition(mounted.container, 1000),
      }
    );
  } finally {
    mounted.cleanup();
  }
}

describe('tier3 system table append rows', () => {
  let mounted: ReturnType<typeof mountTableBenchmark> | null = null;

  bench(
    'append 1,000 rows to an existing 1,000-row table',
    () => {
      mounted!.benchmark.setRows(appendedRows);
    },
    {
      ...noisyTier3BenchOptions,
      setup() {
        mounted = mountTableBenchmark(initialRows);
      },
      beforeEach() {
        mounted!.benchmark.setRows(initialRows);
      },
      teardown() {
        mounted?.cleanup();
        mounted = null;
      },
    }
  );
});
