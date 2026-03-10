import { bench, describe, expect } from 'vitest';
import {
  buildRows,
  mountTableBenchmark,
  tier3BenchOptions,
} from '../shared/_shared';

const rows = buildRows(1000);

{
  const mounted = mountTableBenchmark();
  try {
    mounted.benchmark.setRows(rows);
    expect(mounted.container.querySelectorAll('tr')).toHaveLength(1000);
  } finally {
    mounted.cleanup();
  }
}

describe('tier3 system table create rows', () => {
  let mounted: ReturnType<typeof mountTableBenchmark> | null = null;

  bench(
    'create 1,000 table rows',
    () => {
      mounted!.benchmark.setRows(rows);
    },
    {
      ...tier3BenchOptions,
      setup() {
        mounted = mountTableBenchmark();
      },
      teardown() {
        mounted?.cleanup();
        mounted = null;
      },
    }
  );
});
