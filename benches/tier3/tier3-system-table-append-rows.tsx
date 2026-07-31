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
  let cycle: ReturnType<typeof createDirectionalBenchCycle> | null = null;

  bench('append 1,000 rows to a 1,000-row table', () => cycle!.runForward(), {
    ...tableHeavyBenchOptions,
    setup() {
      mounted = mountTableBenchmark(initialRows);
      cycle = createDirectionalBenchCycle({
        label: 'append 1,000 to 1,000 rows',
        forward: () => mounted!.benchmark.setRows(appendedRows),
        reset: () => mounted!.benchmark.setRows(initialRows),
        verifyInitial: () =>
          assertRowCountTransition(mounted!.container, 1_000),
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
