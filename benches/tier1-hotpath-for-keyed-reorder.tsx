import { bench, describe, expect } from 'vitest';
import {
  buildRows,
  mountTableBenchmark,
  swapRows,
  tier1BenchOptions,
  withForBenchDiagnostics,
} from './_shared';

const initialRows = buildRows(1000);
const swappedRows = swapRows(initialRows, 1, 998);

{
  const mounted = mountTableBenchmark(initialRows);
  try {
    const originalSecondRow = mounted.container.querySelectorAll('tr')[1];
    const originalLastTargetRow = mounted.container.querySelectorAll('tr')[998];
    const { metrics } = withForBenchDiagnostics(() => {
      mounted.benchmark.setRows(swappedRows);
    });
    const nextRows = mounted.container.querySelectorAll('tr');
    expect(nextRows[1]).toBe(originalLastTargetRow);
    expect(nextRows[998]).toBe(originalSecondRow);
    expect(metrics.fastLaneName).toBe('FULL_KEYED');
  } finally {
    mounted.cleanup();
  }
}

describe('tier1 hotpath for keyed reorder', () => {
  let mounted: ReturnType<typeof mountTableBenchmark> | null = null;

  bench(
    'swap distant keyed rows while preserving DOM identity',
    () => {
      mounted!.benchmark.setRows(swappedRows);
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
