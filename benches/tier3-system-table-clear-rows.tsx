import { bench, describe, expect } from 'vitest';
import { buildRows, mountTableBenchmark, tier3BenchOptions } from './_shared';

const initialRows = buildRows(1000);

{
  const mounted = mountTableBenchmark(initialRows);
  try {
    mounted.benchmark.setRows([]);
    expect(mounted.container.querySelectorAll('tr')).toHaveLength(0);
  } finally {
    mounted.cleanup();
  }
}

describe('tier3 system table clear rows', () => {
  let mounted: ReturnType<typeof mountTableBenchmark> | null = null;

  bench(
    'clear a 1,000-row table',
    () => {
      mounted!.benchmark.setRows([]);
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
