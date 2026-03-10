import { bench, describe, expect } from 'vitest';
import {
  buildRows,
  mountTableBenchmark,
  tier1BenchOptions,
  withForBenchDiagnostics,
} from '../shared/_shared';

const initialRows = buildRows(1000);

{
  const mounted = mountTableBenchmark(initialRows);
  try {
    const { metrics } = withForBenchDiagnostics(() => {
      mounted.benchmark.setRows([]);
    });
    expect(mounted.container.querySelectorAll('tr')).toHaveLength(0);
    expect(metrics.fastLaneName).toBe('TRUNCATE');
  } finally {
    mounted.cleanup();
  }
}

describe('tier1 hotpath for truncate', () => {
  let mounted: ReturnType<typeof mountTableBenchmark> | null = null;

  bench(
    'truncate 1,000 keyed rows to empty',
    () => {
      mounted!.benchmark.setRows([]);
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
