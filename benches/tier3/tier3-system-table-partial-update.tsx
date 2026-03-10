import { bench, describe, expect } from 'vitest';
import {
  buildRows,
  mountTableBenchmark,
  tier3BenchOptions,
  updateEveryNthRow,
} from '../shared/_shared';

const initialRows = buildRows(1000);
const updatedRows = updateEveryNthRow(initialRows);

{
  const mounted = mountTableBenchmark(initialRows);
  try {
    mounted.benchmark.setRows(updatedRows);
    expect(
      mounted.container.querySelectorAll('tr')[0].querySelectorAll('td')[1]
        .textContent
    ).toBe('Item 1 !!!');
  } finally {
    mounted.cleanup();
  }
}

describe('tier3 system table partial update', () => {
  let mounted: ReturnType<typeof mountTableBenchmark> | null = null;

  bench(
    'update every 10th row in a 1,000-row table',
    () => {
      mounted!.benchmark.setRows(updatedRows);
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
