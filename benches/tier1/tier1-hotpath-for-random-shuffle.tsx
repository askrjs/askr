import { bench, describe, expect } from 'vitest';
import {
  buildRows,
  mountTableBenchmark,
  shuffleRows,
  tier1BenchOptions,
  withForBenchDiagnostics,
} from '../shared/_shared';

const initialRows = buildRows(1000);
const shuffledRows = shuffleRows(initialRows, 0x5eed_1234);

expect(shuffledRows.map((row) => row.id)).not.toEqual(
  initialRows.map((row) => row.id)
);

{
  const mounted = mountTableBenchmark(initialRows);

  try {
    const originalRows = mounted.container.querySelectorAll('tr');
    const expectedFirstRow = originalRows[shuffledRows[0].id - 1];
    const expectedLastRow = originalRows[shuffledRows[999].id - 1];
    const { metrics } = withForBenchDiagnostics(() => {
      mounted.benchmark.setRows(shuffledRows);
    });
    const nextRows = mounted.container.querySelectorAll('tr');

    expect(nextRows).toHaveLength(1000);
    expect(nextRows[0]).toBe(expectedFirstRow);
    expect(nextRows[999]).toBe(expectedLastRow);
    expect(metrics.fastLaneName).toBe('FULL_KEYED');
    expect(metrics.itemsCreated).toBe(0);
    expect(metrics.itemsRemoved).toBe(0);
  } finally {
    mounted.cleanup();
  }
}

describe('tier1 hotpath for random shuffle', () => {
  let mounted: ReturnType<typeof mountTableBenchmark> | null = null;

  bench(
    'shuffle 1,000 keyed rows with a fixed permutation',
    () => {
      mounted!.benchmark.setRows(shuffledRows);
    },
    {
      ...tier1BenchOptions,
      setup() {
        mounted = mountTableBenchmark(initialRows);
      },
      teardown() {
        mounted?.cleanup();
        mounted = null;
      },
    }
  );
});
