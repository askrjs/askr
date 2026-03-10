import { bench, describe, expect } from 'vitest';
import {
  buildRows,
  mountTableBenchmark,
  tier1BenchOptions,
  withForBenchDiagnostics,
} from './_shared';

const rows = buildRows(1000);

{
  const mounted = mountTableBenchmark();
  try {
    const { metrics } = withForBenchDiagnostics(() => {
      mounted.benchmark.setRows(rows);
    });
    expect(mounted.container.querySelectorAll('tr')).toHaveLength(1000);
    expect(metrics.fastLaneName).toBe('APPEND');
  } finally {
    mounted.cleanup();
  }
}

describe('tier1 hotpath for append', () => {
  let mounted: ReturnType<typeof mountTableBenchmark> | null = null;

  bench(
    'append 1,000 keyed rows from empty',
    () => {
      mounted!.benchmark.setRows(rows);
    },
    {
      ...tier1BenchOptions,
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
