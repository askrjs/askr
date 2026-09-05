import { bench, describe } from 'vite-plus/test';
import {
  assertRowCountTransition,
  buildRows,
  createDirectionalBenchCycle,
  mountTableBenchmark,
  tier3BenchOptions,
} from '../shared/_shared';

const fullRows = buildRows(2_000);
const truncatedRows = fullRows.slice(0, 1_000);

describe('tier3 system table truncate rows', () => {
  let mounted: ReturnType<typeof mountTableBenchmark> | null = null;
  let cycle: ReturnType<typeof createDirectionalBenchCycle> | null = null;

  bench('truncate a 2,000-row table to 1,000 rows', () => cycle!.runForward(), {
    ...tier3BenchOptions,
    iterations: 1000,
    setup() {
      mounted = mountTableBenchmark(fullRows);
      mounted.benchmark.setRows(truncatedRows);
      assertRowCountTransition(mounted.container, 1_000);
      mounted.benchmark.setRows(fullRows);
      assertRowCountTransition(mounted.container, 2_000);
      cycle = createDirectionalBenchCycle({
        label: 'truncate 2,000 to 1,000 rows',
        forward: () => mounted!.benchmark.setRows(truncatedRows),
        reset: () => mounted!.benchmark.setRows(fullRows),
        verifyInitial: () =>
          assertRowCountTransition(mounted!.container, 2_000),
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
