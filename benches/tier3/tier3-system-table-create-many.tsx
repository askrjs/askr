import { bench, describe } from 'vite-plus/test';
import type { RowData } from '../shared/_shared';
import {
  assertRowCountTransition,
  assertToggleMutationGuard,
  buildRows,
  createRowToggle,
  createDirectionalBenchCycle,
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
  let cycle: ReturnType<typeof createDirectionalBenchCycle> | null = null;

  bench('create 5,000 table rows from empty', () => cycle!.runForward(), {
    ...tableCreateManyBenchOptions,
    setup() {
      mounted = mountTableBenchmark();
      cycle = createDirectionalBenchCycle({
        label: 'create 5,000 rows',
        forward: () => mounted!.benchmark.setRows(rows),
        reset: () => mounted!.benchmark.setRows(emptyRows),
        verifyInitial: () => assertRowCountTransition(mounted!.container, 0),
      });
    },
    teardown() {
      cycle?.teardown();
      mounted?.cleanup();
      mounted = null;
      cycle = null;
    },
  });
});
