import { bench, describe, expect } from 'vitest';
import {
  buildRows,
  mountTableBenchmark,
  swapRows,
  tier3BenchOptions,
} from './_shared';

const initialRows = buildRows(1000);
const swappedRows = swapRows(initialRows, 1, 998);

{
  const mounted = mountTableBenchmark(initialRows);
  try {
    const originalRow = mounted.container.querySelectorAll('tr')[1];
    mounted.benchmark.setRows(swappedRows);
    expect(mounted.container.querySelectorAll('tr')[998]).toBe(originalRow);
  } finally {
    mounted.cleanup();
  }
}

describe('tier3 system table swap rows', () => {
  let mounted: ReturnType<typeof mountTableBenchmark> | null = null;

  bench(
    'swap two distant rows in a 1,000-row table',
    () => {
      mounted!.benchmark.setRows(swappedRows);
    },
    {
      ...tier3BenchOptions,
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
