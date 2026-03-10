import { bench, describe, expect } from 'vitest';
import {
  buildRows,
  mountTableBenchmark,
  tier1BenchOptions,
  updateEveryNthRow,
  withForBenchDiagnostics,
} from './_shared';

const initialRows = buildRows(1000);
const updatedRows = updateEveryNthRow(initialRows);

{
  const mounted = mountTableBenchmark(initialRows);
  try {
    const { metrics } = withForBenchDiagnostics(() => {
      mounted.benchmark.setRows(updatedRows);
    });
    expect(mounted.container.querySelector('tr td + td')?.textContent).toBe(
      'Item 1 !!!'
    );
    expect(['APPEND', 'NO_REORDER']).toContain(metrics.fastLaneName);
  } finally {
    mounted.cleanup();
  }
}

describe('tier1 hotpath for stable keyed update', () => {
  let mounted: ReturnType<typeof mountTableBenchmark> | null = null;

  bench(
    'update every 10th row without reordering keys',
    () => {
      mounted!.benchmark.setRows(updatedRows);
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
