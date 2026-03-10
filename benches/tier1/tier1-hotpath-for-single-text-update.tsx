import { bench, describe, expect } from 'vitest';
import {
  buildRows,
  mountTableBenchmark,
  replaceRowLabelById,
  tier1BenchOptions,
  withForBenchDiagnostics,
} from '../shared/_shared';

const initialRows = buildRows(1000);
const nextLabel = 'Item 500 updated once';
const updatedRows = replaceRowLabelById(initialRows, 500, nextLabel);

{
  const mounted = mountTableBenchmark(initialRows);

  try {
    const originalTargetRow = mounted.container.querySelectorAll('tr')[499];
    const { metrics } = withForBenchDiagnostics(() => {
      mounted.benchmark.setRows(updatedRows);
    });
    const nextRows = mounted.container.querySelectorAll('tr');
    const targetLabel = nextRows[499]?.querySelector('a')?.textContent;

    expect(nextRows).toHaveLength(1000);
    expect(nextRows[499]).toBe(originalTargetRow);
    expect(targetLabel).toBe(nextLabel);
    expect(['APPEND', 'NO_REORDER']).toContain(metrics.fastLaneName);
    expect(metrics.domMoves).toBe(0);
    expect(metrics.itemsCreated).toBe(0);
    expect(metrics.itemsRemoved).toBe(0);
  } finally {
    mounted.cleanup();
  }
}

describe('tier1 hotpath for single text update', () => {
  let mounted: ReturnType<typeof mountTableBenchmark> | null = null;

  bench(
    'update one keyed row label in a 1,000-row table',
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
