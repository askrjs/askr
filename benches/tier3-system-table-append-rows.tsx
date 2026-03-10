import { bench, describe, expect } from 'vitest';
import { buildRows, mountTableBenchmark, tier3BenchOptions } from './_shared';

const initialRows = buildRows(1000);
const appendedRows = buildRows(2000);

{
  const mounted = mountTableBenchmark(initialRows);
  try {
    mounted.benchmark.setRows(appendedRows);
    expect(mounted.container.querySelectorAll('tr')).toHaveLength(2000);
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
