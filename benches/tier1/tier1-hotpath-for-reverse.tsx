import { bench, describe, expect } from 'vitest';
import {
  buildRows,
  mountTableBenchmark,
  reverseRows,
  tier1BenchOptions,
  withForBenchDiagnostics,
} from '../shared/_shared';

const initialRows = buildRows(1000);
const reversedRows = reverseRows(initialRows);

{
  const mounted = mountTableBenchmark(initialRows);

  try {
    const originalRows = mounted.container.querySelectorAll('tr');
    const originalFirstRow = originalRows[0];
    const originalLastRow = originalRows[999];
    const { metrics } = withForBenchDiagnostics(() => {
      mounted.benchmark.setRows(reversedRows);
    });
    const nextRows = mounted.container.querySelectorAll('tr');

    expect(nextRows).toHaveLength(1000);
    expect(nextRows[0]).toBe(originalLastRow);
    expect(nextRows[999]).toBe(originalFirstRow);
    expect(metrics.fastLaneName).toBe('FULL_KEYED');
    expect(metrics.itemsCreated).toBe(0);
    expect(metrics.itemsRemoved).toBe(0);
  } finally {
    mounted.cleanup();
  }
}

describe('tier1 hotpath for reverse', () => {
  let mounted: ReturnType<typeof mountTableBenchmark> | null = null;

  bench(
    'reverse 1,000 keyed rows',
    () => {
      mounted!.benchmark.setRows(reversedRows);
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
