import { bench, describe, expect } from 'vitest';
import {
  buildRows,
  mountTableBenchmark,
  tier3BenchOptions,
} from '../shared/_shared';

const rows = buildRows(5000);

{
  const mounted = mountTableBenchmark();
  try {
    mounted.benchmark.setRows(rows);
    expect(mounted.container.querySelectorAll('tr')).toHaveLength(5000);
  } finally {
    mounted.cleanup();
  }
}

describe('tier3 system table create many', () => {
  let mounted: ReturnType<typeof mountTableBenchmark> | null = null;

  bench(
    'create 5,000 table rows',
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
