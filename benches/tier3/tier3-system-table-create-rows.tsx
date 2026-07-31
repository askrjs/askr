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

const tableHeavyBenchOptions = extendBenchOptions(tier3BenchOptions, {
  time: 2500,
  iterations: 4,
  warmupTime: 350,
  warmupIterations: 1,
});

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
  let cycle: ReturnType<typeof createDirectionalBenchCycle> | null = null;

  bench('create 1,000 table rows from empty', () => cycle!.runForward(), {
    ...tableHeavyBenchOptions,
    setup() {
      mounted = mountTableBenchmark();
      cycle = createDirectionalBenchCycle({
        label: 'create 1,000 rows',
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
